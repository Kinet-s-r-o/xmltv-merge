package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/mail"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"xmltv-merge/internal/auth"
	"xmltv-merge/internal/models"
	"xmltv-merge/internal/repository"
)

// AuthSettings configures sessions, lockout and the TOTP issuer.
type AuthSettings struct {
	// SessionIdleTimeout ends a session after this much inactivity.
	SessionIdleTimeout time.Duration
	// SessionMaxLifetime ends a session this long after sign-in regardless of activity.
	SessionMaxLifetime time.Duration
	// LockAfter consecutive failures lock an account for LockFor.
	LockAfter int
	LockFor   time.Duration
	// TOTPIssuer is shown in authenticator apps.
	TOTPIssuer string
	// SecretKey encrypts RADIUS secrets and TOTP seeds at rest (optional).
	SecretKey string
	// BootstrapUsername/BootstrapPassword create the first administrator at
	// startup when no users exist.
	BootstrapUsername string
	BootstrapPassword string
}

// Errors returned to the login page. They are deliberately generic.
var (
	ErrInvalidCredentials = errors.New("invalid user name or password, or the account is temporarily locked")
	ErrTooManyAttempts    = errors.New("too many failed sign-in attempts from this address; try again in a few minutes")
	ErrAuthServerDown     = errors.New("the RADIUS authentication servers did not answer; try again or contact an administrator")
	ErrChallengeExpired   = errors.New("the sign-in step expired; sign in again")
	ErrInvalidCode        = errors.New("the verification code is not valid")
	ErrSetupDone          = errors.New("the first administrator already exists")
)

// Principal is the authenticated user of a request.
type Principal struct {
	User        *models.User
	Session     *models.Session
	Permissions auth.Permissions
}

// Can reports whether the principal has action on section.
func (p *Principal) Can(section auth.Section, action auth.Action) bool {
	return p != nil && p.Permissions.Allows(section, action)
}

// LoginResult is the outcome of a successful credential or code check.
type LoginResult struct {
	// Status is "ok", "totp_required" or "totp_setup_required".
	Status    string
	Challenge string
	// Enrollment data for totp_setup_required.
	TOTPSecret string
	TOTPURI    string
	// Session token and CSRF token for status ok.
	SessionToken string
	CSRFToken    string
	ExpiresAt    time.Time
	User         *models.User
}

type loginChallenge struct {
	userID   int
	setup    bool
	secret   string
	expires  time.Time
	attempts int
}

type pendingEnrollment struct {
	secret  string
	expires time.Time
}

type ipWindow struct {
	failures int
	start    time.Time
}

const (
	challengeTTL         = 5 * time.Minute
	challengeMaxAttempts = 5
	enrollmentTTL        = 10 * time.Minute
	ipWindowLength       = 15 * time.Minute
	ipMaxFailures        = 30
	sessionTouchInterval = time.Minute
)

// AuthService implements sign-in, sessions, 2FA and user/role/RADIUS administration.
type AuthService struct {
	repo     *repository.AuthRepository
	box      *auth.SecretBox
	settings AuthSettings

	mu          sync.Mutex
	challenges  map[string]*loginChallenge
	enrollments map[int]*pendingEnrollment
	ipFailures  map[string]*ipWindow
	setupMu     sync.Mutex
}

func NewAuthService(db *pgxpool.Pool, settings AuthSettings) (*AuthService, error) {
	if settings.SessionIdleTimeout <= 0 {
		settings.SessionIdleTimeout = 8 * time.Hour
	}
	if settings.SessionMaxLifetime <= 0 {
		settings.SessionMaxLifetime = 7 * 24 * time.Hour
	}
	if settings.SessionIdleTimeout > settings.SessionMaxLifetime {
		settings.SessionIdleTimeout = settings.SessionMaxLifetime
	}
	if settings.LockAfter <= 0 {
		settings.LockAfter = 5
	}
	if settings.LockFor <= 0 {
		settings.LockFor = 15 * time.Minute
	}
	if settings.TOTPIssuer == "" {
		settings.TOTPIssuer = "XMLTV EPG"
	}
	box, err := auth.NewSecretBox(settings.SecretKey)
	if err != nil {
		return nil, err
	}
	if !box.Encrypting() {
		log.Printf("auth: AUTH_SECRET_KEY is not set; RADIUS secrets and TOTP seeds are stored unencrypted")
	}
	return &AuthService{
		repo:        repository.NewAuthRepository(db),
		box:         box,
		settings:    settings,
		challenges:  map[string]*loginChallenge{},
		enrollments: map[int]*pendingEnrollment{},
		ipFailures:  map[string]*ipWindow{},
	}, nil
}

// Settings returns the effective settings.
func (s *AuthService) Settings() AuthSettings { return s.settings }

// Run removes expired sessions and in-memory challenges every 15 minutes.
func (s *AuthService) Run(ctx context.Context) {
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if n, err := s.repo.DeleteExpiredSessions(ctx); err != nil {
				log.Printf("auth: delete expired sessions: %v", err)
			} else if n > 0 {
				log.Printf("auth: removed %d expired sessions", n)
			}
			s.pruneMemory(time.Now())
		}
	}
}

func (s *AuthService) pruneMemory(now time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for k, c := range s.challenges {
		if now.After(c.expires) {
			delete(s.challenges, k)
		}
	}
	for k, e := range s.enrollments {
		if now.After(e.expires) {
			delete(s.enrollments, k)
		}
	}
	for k, w := range s.ipFailures {
		if now.Sub(w.start) > ipWindowLength {
			delete(s.ipFailures, k)
		}
	}
}

// ---- Bootstrap ------------------------------------------------------------

// SetupRequired reports whether no user exists yet.
func (s *AuthService) SetupRequired(ctx context.Context) (bool, error) {
	n, err := s.repo.CountUsers(ctx)
	return n == 0, err
}

// BootstrapFromEnv creates the first administrator from settings when the
// user table is empty.
func (s *AuthService) BootstrapFromEnv(ctx context.Context) error {
	if s.settings.BootstrapUsername == "" || s.settings.BootstrapPassword == "" {
		return nil
	}
	_, err := s.Setup(ctx, s.settings.BootstrapUsername, s.settings.BootstrapPassword, "Administrator")
	if errors.Is(err, ErrSetupDone) {
		return nil
	}
	if err == nil {
		log.Printf("auth: created the first administrator %q from ADMIN_USERNAME", s.settings.BootstrapUsername)
	}
	return err
}

// Setup creates the first administrator; it fails once any user exists.
func (s *AuthService) Setup(ctx context.Context, username, password, displayName string) (*models.User, error) {
	s.setupMu.Lock()
	defer s.setupMu.Unlock()
	required, err := s.SetupRequired(ctx)
	if err != nil {
		return nil, err
	}
	if !required {
		return nil, ErrSetupDone
	}
	roleID, err := s.repo.BuiltinAdminRoleID(ctx)
	if err != nil {
		return nil, fmt.Errorf("find Administrator role: %w", err)
	}
	user := &models.User{
		Username:    strings.TrimSpace(username),
		DisplayName: strings.TrimSpace(displayName),
		AuthType:    models.AuthTypeLocal,
		RoleID:      roleID,
		Enabled:     true,
	}
	if err := validateUser(user); err != nil {
		return nil, err
	}
	if err := auth.ValidatePassword(password); err != nil {
		return nil, invalid("%s", err.Error())
	}
	if user.PasswordHash, err = auth.HashPassword(password); err != nil {
		return nil, err
	}
	id, err := s.repo.CreateUser(ctx, user)
	if err != nil {
		return nil, err
	}
	return s.repo.GetUser(ctx, id)
}

// ---- Sign-in --------------------------------------------------------------

func (s *AuthService) ipBlocked(ip string, now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	w := s.ipFailures[ip]
	return w != nil && now.Sub(w.start) <= ipWindowLength && w.failures >= ipMaxFailures
}

func (s *AuthService) recordIPFailure(ip string, now time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	w := s.ipFailures[ip]
	if w == nil || now.Sub(w.start) > ipWindowLength {
		w = &ipWindow{start: now}
		s.ipFailures[ip] = w
	}
	w.failures++
}

func (s *AuthService) failLogin(ctx context.Context, user *models.User, ip string) {
	s.recordIPFailure(ip, time.Now())
	if user != nil {
		if err := s.repo.RecordLoginFailure(ctx, user.ID, s.settings.LockAfter, s.settings.LockFor); err != nil {
			log.Printf("auth: record login failure: %v", err)
		}
	}
}

// Login checks credentials and returns either a session or the next 2FA step.
func (s *AuthService) Login(ctx context.Context, username, password, ip, userAgent string) (*LoginResult, error) {
	now := time.Now()
	if s.ipBlocked(ip, now) {
		return nil, ErrTooManyAttempts
	}
	username = strings.TrimSpace(username)
	if username == "" || password == "" || len(password) > auth.MaxPasswordLength {
		auth.BurnPasswordCheck(password)
		s.recordIPFailure(ip, now)
		return nil, ErrInvalidCredentials
	}
	user, err := s.repo.GetUserByUsername(ctx, username)
	if err != nil {
		return nil, err
	}
	if user == nil || !user.Enabled || (user.LockedUntil != nil && user.LockedUntil.After(now)) {
		auth.BurnPasswordCheck(password)
		s.failLogin(ctx, nil, ip)
		if user != nil && user.Enabled {
			log.Printf("auth: sign-in refused for locked account %q from %s", user.Username, ip)
		}
		return nil, ErrInvalidCredentials
	}

	switch user.AuthType {
	case models.AuthTypeLocal:
		if !auth.VerifyPassword(user.PasswordHash, password) {
			s.failLogin(ctx, user, ip)
			log.Printf("auth: failed sign-in for %q from %s", user.Username, ip)
			return nil, ErrInvalidCredentials
		}
	case models.AuthTypeRemote:
		servers, err := s.radiusClients(ctx)
		if err != nil {
			return nil, err
		}
		res, err := auth.RadiusAuthenticate(ctx, servers, user.Username, password)
		if err != nil {
			log.Printf("auth: RADIUS sign-in for %q failed: %v", user.Username, err)
			return nil, ErrAuthServerDown
		}
		if !res.Accepted {
			s.failLogin(ctx, user, ip)
			log.Printf("auth: RADIUS server %s rejected %q from %s", res.Server, user.Username, ip)
			return nil, ErrInvalidCredentials
		}
	default:
		return nil, ErrInvalidCredentials
	}

	if user.TOTPEnabled || user.TOTPRequired {
		return s.newChallenge(user)
	}
	return s.completeLogin(ctx, user, ip, userAgent)
}

func (s *AuthService) newChallenge(user *models.User) (*LoginResult, error) {
	token, err := auth.RandomToken(32)
	if err != nil {
		return nil, err
	}
	ch := &loginChallenge{userID: user.ID, expires: time.Now().Add(challengeTTL)}
	result := &LoginResult{Status: "totp_required", Challenge: token}
	if !user.TOTPEnabled {
		secret, err := auth.NewTOTPSecret()
		if err != nil {
			return nil, err
		}
		ch.setup = true
		ch.secret = secret
		result.Status = "totp_setup_required"
		result.TOTPSecret = secret
		result.TOTPURI = auth.TOTPURI(s.settings.TOTPIssuer, user.Username, secret)
	}
	s.mu.Lock()
	s.challenges[token] = ch
	s.mu.Unlock()
	return result, nil
}

// VerifyChallenge completes sign-in with a TOTP code (and enables 2FA for a
// setup challenge).
func (s *AuthService) VerifyChallenge(ctx context.Context, token, code, ip, userAgent string) (*LoginResult, error) {
	now := time.Now()
	if s.ipBlocked(ip, now) {
		return nil, ErrTooManyAttempts
	}
	s.mu.Lock()
	ch := s.challenges[token]
	if ch != nil {
		ch.attempts++
		if now.After(ch.expires) || ch.attempts > challengeMaxAttempts {
			delete(s.challenges, token)
			ch = nil
		}
	}
	s.mu.Unlock()
	if ch == nil {
		return nil, ErrChallengeExpired
	}
	user, err := s.repo.GetUser(ctx, ch.userID)
	if err != nil {
		return nil, err
	}
	if user == nil || !user.Enabled || (user.LockedUntil != nil && user.LockedUntil.After(now)) {
		s.dropChallenge(token)
		return nil, ErrChallengeExpired
	}

	if ch.setup {
		step, ok := auth.VerifyTOTP(ch.secret, code, now, 0)
		if !ok {
			s.failLogin(ctx, user, ip)
			return nil, ErrInvalidCode
		}
		sealed, err := s.box.Seal(ch.secret)
		if err != nil {
			return nil, err
		}
		if err := s.repo.SetTOTP(ctx, user.ID, sealed, true, step); err != nil {
			return nil, err
		}
		log.Printf("auth: %q enrolled two-factor authentication during sign-in", user.Username)
	} else {
		if err := s.checkUserTOTP(ctx, user, code, now); err != nil {
			s.failLogin(ctx, user, ip)
			return nil, err
		}
	}
	s.dropChallenge(token)
	return s.completeLogin(ctx, user, ip, userAgent)
}

func (s *AuthService) dropChallenge(token string) {
	s.mu.Lock()
	delete(s.challenges, token)
	s.mu.Unlock()
}

func (s *AuthService) checkUserTOTP(ctx context.Context, user *models.User, code string, now time.Time) error {
	if !user.TOTPEnabled {
		return ErrInvalidCode
	}
	secret, err := s.box.Open(user.TOTPSecret)
	if err != nil {
		return err
	}
	step, ok := auth.VerifyTOTP(secret, code, now, user.TOTPLastStep)
	if !ok {
		return ErrInvalidCode
	}
	consumed, err := s.repo.ConsumeTOTPStep(ctx, user.ID, step)
	if err != nil {
		return err
	}
	if !consumed {
		return ErrInvalidCode
	}
	return nil
}

func (s *AuthService) completeLogin(ctx context.Context, user *models.User, ip, userAgent string) (*LoginResult, error) {
	token, err := auth.RandomToken(32)
	if err != nil {
		return nil, err
	}
	csrf, err := auth.RandomToken(32)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	session := &models.Session{
		TokenHash: auth.HashToken(token),
		UserID:    user.ID,
		CSRFToken: csrf,
		CreatedAt: now,
		ExpiresAt: now.Add(s.settings.SessionIdleTimeout),
	}
	if err := s.repo.CreateSession(ctx, session, ip, userAgent); err != nil {
		return nil, err
	}
	if err := s.repo.RecordLoginSuccess(ctx, user.ID); err != nil {
		log.Printf("auth: record login success: %v", err)
	}
	log.Printf("auth: %q signed in from %s", user.Username, ip)
	return &LoginResult{Status: "ok", SessionToken: token, CSRFToken: csrf, ExpiresAt: session.ExpiresAt, User: user}, nil
}

// Authenticate resolves a session token to a principal, or nil when the
// token is unknown, expired or belongs to a disabled user.
func (s *AuthService) Authenticate(ctx context.Context, token string) (*Principal, error) {
	if token == "" || len(token) > 128 {
		return nil, nil
	}
	hash := auth.HashToken(token)
	session, user, err := s.repo.GetSession(ctx, hash)
	if err != nil || session == nil {
		return nil, err
	}
	now := time.Now()
	if !user.Enabled || (user.LockedUntil != nil && user.LockedUntil.After(now)) || (user.TOTPRequired && !user.TOTPEnabled) {
		_ = s.repo.DeleteSession(ctx, hash)
		return nil, nil
	}
	if now.Sub(session.LastSeenAt) > sessionTouchInterval {
		expires := now.Add(s.settings.SessionIdleTimeout)
		if limit := session.CreatedAt.Add(s.settings.SessionMaxLifetime); expires.After(limit) {
			expires = limit
		}
		if err := s.repo.TouchSession(ctx, hash, expires); err != nil {
			log.Printf("auth: touch session: %v", err)
		}
		session.ExpiresAt = expires
	}
	perms, err := s.repo.RolePermissions(ctx, user.RoleID)
	if err != nil {
		return nil, err
	}
	return &Principal{User: user, Session: session, Permissions: perms}, nil
}

// Logout ends the session of token.
func (s *AuthService) Logout(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	return s.repo.DeleteSession(ctx, auth.HashToken(token))
}

// ---- Own account ----------------------------------------------------------

// ChangePassword changes a local user's own password and signs out their other sessions.
func (s *AuthService) ChangePassword(ctx context.Context, p *Principal, current, next string) error {
	if p.User.AuthType != models.AuthTypeLocal {
		return invalid("remote users change their password on the RADIUS server")
	}
	user, err := s.repo.GetUser(ctx, p.User.ID)
	if err != nil || user == nil {
		return fmt.Errorf("load user: %w", err)
	}
	if !auth.VerifyPassword(user.PasswordHash, current) {
		return invalid("the current password is not correct")
	}
	if err := auth.ValidatePassword(next); err != nil {
		return invalid("%s", err.Error())
	}
	if current == next {
		return invalid("the new password must differ from the current one")
	}
	hash, err := auth.HashPassword(next)
	if err != nil {
		return err
	}
	if err := s.repo.SetPassword(ctx, user.ID, hash); err != nil {
		return err
	}
	return s.repo.DeleteUserSessions(ctx, user.ID, p.Session.TokenHash)
}

// BeginTOTPEnrollment generates a new secret for the signed-in user; it is
// only stored once confirmed with a code.
func (s *AuthService) BeginTOTPEnrollment(p *Principal) (secret, uri string, err error) {
	if p.User.TOTPEnabled {
		return "", "", invalid("two-factor authentication is already enabled")
	}
	secret, err = auth.NewTOTPSecret()
	if err != nil {
		return "", "", err
	}
	s.mu.Lock()
	s.enrollments[p.User.ID] = &pendingEnrollment{secret: secret, expires: time.Now().Add(enrollmentTTL)}
	s.mu.Unlock()
	return secret, auth.TOTPURI(s.settings.TOTPIssuer, p.User.Username, secret), nil
}

// ConfirmTOTPEnrollment enables 2FA when code matches the pending secret.
func (s *AuthService) ConfirmTOTPEnrollment(ctx context.Context, p *Principal, code string) error {
	s.mu.Lock()
	pending := s.enrollments[p.User.ID]
	s.mu.Unlock()
	if pending == nil || time.Now().After(pending.expires) {
		return invalid("the enrollment expired; start the setup again")
	}
	step, ok := auth.VerifyTOTP(pending.secret, code, time.Now(), 0)
	if !ok {
		return ErrInvalidCode
	}
	sealed, err := s.box.Seal(pending.secret)
	if err != nil {
		return err
	}
	if err := s.repo.SetTOTP(ctx, p.User.ID, sealed, true, step); err != nil {
		return err
	}
	s.mu.Lock()
	delete(s.enrollments, p.User.ID)
	s.mu.Unlock()
	log.Printf("auth: %q enabled two-factor authentication", p.User.Username)
	return nil
}

// DisableOwnTOTP turns 2FA off after checking a current code.
func (s *AuthService) DisableOwnTOTP(ctx context.Context, p *Principal, code string) error {
	if p.User.TOTPRequired {
		return invalid("an administrator requires two-factor authentication for this account")
	}
	user, err := s.repo.GetUser(ctx, p.User.ID)
	if err != nil || user == nil {
		return fmt.Errorf("load user: %w", err)
	}
	if err := s.checkUserTOTP(ctx, user, code, time.Now()); err != nil {
		return err
	}
	if err := s.repo.SetTOTP(ctx, user.ID, "", false, 0); err != nil {
		return err
	}
	log.Printf("auth: %q disabled two-factor authentication", user.Username)
	return nil
}

// ---- Users ----------------------------------------------------------------

var usernamePattern = regexp.MustCompile(`^[A-Za-z0-9._@-]{1,100}$`)

func validateUser(u *models.User) error {
	u.Username = strings.TrimSpace(u.Username)
	u.DisplayName = strings.TrimSpace(u.DisplayName)
	u.Email = strings.TrimSpace(u.Email)
	if !usernamePattern.MatchString(u.Username) {
		return invalid("user name must have 1-100 characters: letters, digits, dot, underscore, @ or hyphen")
	}
	if len(u.DisplayName) > 200 {
		return invalid("display name must have at most 200 characters")
	}
	if u.Email != "" {
		if len(u.Email) > 254 {
			return invalid("e-mail must have at most 254 characters")
		}
		if addr, err := mail.ParseAddress(u.Email); err != nil || addr.Address != u.Email {
			return invalid("e-mail address is not valid")
		}
	}
	if u.AuthType != models.AuthTypeLocal && u.AuthType != models.AuthTypeRemote {
		return invalid("user type must be local or remote")
	}
	if u.RoleID <= 0 {
		return invalid("choose a role")
	}
	return nil
}

// UserInput is the editable part of a user; Password is only used for local users.
type UserInput struct {
	Username     string `json:"username"`
	DisplayName  string `json:"display_name"`
	Email        string `json:"email"`
	AuthType     string `json:"auth_type"`
	RoleID       int    `json:"role_id"`
	Enabled      bool   `json:"enabled"`
	TOTPRequired bool   `json:"totp_required"`
	Password     string `json:"password"`
}

func (s *AuthService) ListUsers(ctx context.Context) ([]models.User, error) {
	return s.repo.ListUsers(ctx)
}

func (s *AuthService) GetUser(ctx context.Context, id int) (*models.User, error) {
	return s.repo.GetUser(ctx, id)
}

func (s *AuthService) prepareUser(ctx context.Context, in UserInput) (*models.User, error) {
	u := &models.User{
		Username: in.Username, DisplayName: in.DisplayName, Email: in.Email,
		AuthType: in.AuthType, RoleID: in.RoleID, Enabled: in.Enabled, TOTPRequired: in.TOTPRequired,
	}
	if err := validateUser(u); err != nil {
		return nil, err
	}
	role, err := s.repo.GetRole(ctx, u.RoleID)
	if err != nil {
		return nil, err
	}
	if role == nil {
		return nil, invalid("the selected role does not exist")
	}
	if u.AuthType == models.AuthTypeLocal && in.Password != "" {
		if err := auth.ValidatePassword(in.Password); err != nil {
			return nil, invalid("%s", err.Error())
		}
		if u.PasswordHash, err = auth.HashPassword(in.Password); err != nil {
			return nil, err
		}
	}
	return u, nil
}

func (s *AuthService) CreateUser(ctx context.Context, in UserInput) (int, error) {
	if in.AuthType == models.AuthTypeLocal && in.Password == "" {
		return 0, invalid("a password is required for local users")
	}
	u, err := s.prepareUser(ctx, in)
	if err != nil {
		return 0, err
	}
	id, err := s.repo.CreateUser(ctx, u)
	if errors.Is(err, repository.ErrConflict) {
		return 0, invalid("user name %q is already taken", u.Username)
	}
	return id, err
}

// isActiveAdmin reports whether the user is an enabled member of the built-in role.
func (s *AuthService) isActiveAdmin(ctx context.Context, enabled bool, roleID int) (bool, error) {
	if !enabled {
		return false, nil
	}
	adminRole, err := s.repo.BuiltinAdminRoleID(ctx)
	return roleID == adminRole, err
}

func (s *AuthService) guardLastAdmin(ctx context.Context, current *models.User, stillAdmin bool) error {
	wasAdmin, err := s.isActiveAdmin(ctx, current.Enabled, current.RoleID)
	if err != nil || !wasAdmin || stillAdmin {
		return err
	}
	others, err := s.repo.CountActiveAdmins(ctx, current.ID)
	if err != nil {
		return err
	}
	if others == 0 {
		return invalid("%s is the last enabled Administrator; assign the Administrator role to another user first", current.Username)
	}
	return nil
}

// UpdateUser saves a user. actor is the signed-in administrator.
func (s *AuthService) UpdateUser(ctx context.Context, actor *Principal, id int, in UserInput) (bool, error) {
	current, err := s.repo.GetUser(ctx, id)
	if err != nil || current == nil {
		return false, err
	}
	u, err := s.prepareUser(ctx, in)
	if err != nil {
		return false, err
	}
	u.ID = id
	if actor.User.ID == id {
		if !u.Enabled {
			return false, invalid("you cannot disable your own account")
		}
		if u.RoleID != current.RoleID {
			return false, invalid("you cannot change your own role")
		}
		if u.AuthType != current.AuthType {
			return false, invalid("you cannot change the type of your own account")
		}
	}
	if u.AuthType == models.AuthTypeLocal && current.AuthType == models.AuthTypeRemote && u.PasswordHash == "" {
		return false, invalid("set a password when changing a remote user to local")
	}
	stillAdmin, err := s.isActiveAdmin(ctx, u.Enabled, u.RoleID)
	if err != nil {
		return false, err
	}
	if err := s.guardLastAdmin(ctx, current, stillAdmin); err != nil {
		return false, err
	}
	ok, err := s.repo.UpdateUser(ctx, u)
	if errors.Is(err, repository.ErrConflict) {
		return false, invalid("user name %q is already taken", u.Username)
	}
	if err != nil || !ok {
		return ok, err
	}
	// End the user's sessions when access changes; keep the actor's own session.
	if !u.Enabled || u.RoleID != current.RoleID || u.AuthType != current.AuthType || u.PasswordHash != "" ||
		(u.TOTPRequired && !current.TOTPEnabled) || !strings.EqualFold(u.Username, current.Username) {
		keep := ""
		if actor.User.ID == id {
			keep = actor.Session.TokenHash
		}
		if err := s.repo.DeleteUserSessions(ctx, id, keep); err != nil {
			return true, err
		}
	}
	return true, nil
}

func (s *AuthService) DeleteUser(ctx context.Context, actor *Principal, id int) (bool, error) {
	if actor.User.ID == id {
		return false, invalid("you cannot delete your own account")
	}
	current, err := s.repo.GetUser(ctx, id)
	if err != nil || current == nil {
		return false, err
	}
	if err := s.guardLastAdmin(ctx, current, false); err != nil {
		return false, err
	}
	return s.repo.DeleteUser(ctx, id)
}

// ResetUserTOTP removes a user's authenticator; with totp_required they
// enroll again at the next sign-in.
func (s *AuthService) ResetUserTOTP(ctx context.Context, id int) (bool, error) {
	u, err := s.repo.GetUser(ctx, id)
	if err != nil || u == nil {
		return false, err
	}
	if err := s.repo.SetTOTP(ctx, id, "", false, 0); err != nil {
		return false, err
	}
	return true, s.repo.DeleteUserSessions(ctx, id, "")
}

func (s *AuthService) UnlockUser(ctx context.Context, id int) (bool, error) {
	u, err := s.repo.GetUser(ctx, id)
	if err != nil || u == nil {
		return false, err
	}
	return true, s.repo.UnlockUser(ctx, id)
}

// ---- Roles ----------------------------------------------------------------

// RoleInput is the editable part of a role.
type RoleInput struct {
	Name        string           `json:"name"`
	Description string           `json:"description"`
	Permissions auth.Permissions `json:"permissions"`
}

func validateRole(in *RoleInput) error {
	in.Name = strings.TrimSpace(in.Name)
	in.Description = strings.TrimSpace(in.Description)
	if in.Name == "" || len(in.Name) > 100 {
		return invalid("role name must have 1-100 characters")
	}
	if len(in.Description) > 1000 {
		return invalid("description must have at most 1000 characters")
	}
	for section := range in.Permissions {
		if !auth.ValidSection(section) {
			return invalid("unknown section %q", section)
		}
	}
	return nil
}

func (s *AuthService) ListRoles(ctx context.Context) ([]models.Role, error) {
	return s.repo.ListRoles(ctx)
}

func (s *AuthService) GetRole(ctx context.Context, id int) (*models.Role, error) {
	return s.repo.GetRole(ctx, id)
}

func (s *AuthService) CreateRole(ctx context.Context, in RoleInput) (int, error) {
	if err := validateRole(&in); err != nil {
		return 0, err
	}
	id, err := s.repo.CreateRole(ctx, in.Name, in.Description, in.Permissions)
	if errors.Is(err, repository.ErrConflict) {
		return 0, invalid("role %q already exists", in.Name)
	}
	return id, err
}

func (s *AuthService) UpdateRole(ctx context.Context, id int, in RoleInput) (bool, error) {
	if err := validateRole(&in); err != nil {
		return false, err
	}
	ok, err := s.repo.UpdateRole(ctx, id, in.Name, in.Description, in.Permissions)
	if errors.Is(err, repository.ErrConflict) {
		return false, invalid("role %q already exists", in.Name)
	}
	return ok, err
}

func (s *AuthService) DeleteRole(ctx context.Context, id int) (bool, error) {
	role, err := s.repo.GetRole(ctx, id)
	if err != nil || role == nil {
		return false, err
	}
	if role.Builtin {
		return false, invalid("the built-in %s role cannot be deleted", role.Name)
	}
	if role.UserCount > 0 {
		return false, invalid("%s is assigned to %d user(s); assign them another role first", role.Name, role.UserCount)
	}
	ok, err := s.repo.DeleteRole(ctx, id)
	if errors.Is(err, repository.ErrInUse) {
		return false, invalid("%s is still assigned to users", role.Name)
	}
	return ok, err
}

// ---- RADIUS servers -------------------------------------------------------

// RadiusInput is the editable part of a RADIUS server; an empty Secret keeps
// the stored secret on update.
type RadiusInput struct {
	Name                        string `json:"name"`
	Host                        string `json:"host"`
	Port                        int    `json:"port"`
	Secret                      string `json:"secret"`
	TimeoutSeconds              int    `json:"timeout_seconds"`
	Retries                     int    `json:"retries"`
	NASIdentifier               string `json:"nas_identifier"`
	Priority                    int    `json:"priority"`
	RequireMessageAuthenticator bool   `json:"require_message_authenticator"`
	Enabled                     bool   `json:"enabled"`
}

var hostPattern = regexp.MustCompile(`^[A-Za-z0-9.:\-\[\]]{1,255}$`)

func (s *AuthService) prepareRadius(in RadiusInput, creating bool) (*models.RadiusServer, error) {
	srv := &models.RadiusServer{
		Name:                        strings.TrimSpace(in.Name),
		Host:                        strings.Trim(strings.TrimSpace(in.Host), "[]"),
		Port:                        in.Port,
		TimeoutSeconds:              in.TimeoutSeconds,
		Retries:                     in.Retries,
		NASIdentifier:               strings.TrimSpace(in.NASIdentifier),
		Priority:                    in.Priority,
		RequireMessageAuthenticator: in.RequireMessageAuthenticator,
		Enabled:                     in.Enabled,
	}
	switch {
	case srv.Name == "" || len(srv.Name) > 200:
		return nil, invalid("server name must have 1-200 characters")
	case !hostPattern.MatchString(srv.Host):
		return nil, invalid("host must be a host name or IP address")
	case srv.Port < 1 || srv.Port > 65535:
		return nil, invalid("port must be 1-65535")
	case srv.TimeoutSeconds < 1 || srv.TimeoutSeconds > 60:
		return nil, invalid("timeout must be 1-60 seconds")
	case srv.Retries < 0 || srv.Retries > 5:
		return nil, invalid("retries must be 0-5")
	case srv.Priority < 0 || srv.Priority > 1000:
		return nil, invalid("priority must be 0-1000")
	case len(srv.NASIdentifier) > 100:
		return nil, invalid("NAS identifier must have at most 100 characters")
	case len(in.Secret) > 128:
		return nil, invalid("shared secret must have at most 128 characters")
	case creating && in.Secret == "":
		return nil, invalid("shared secret is required")
	}
	if srv.NASIdentifier == "" {
		srv.NASIdentifier = "xmltv-epg"
	}
	if in.Secret != "" {
		sealed, err := s.box.Seal(in.Secret)
		if err != nil {
			return nil, err
		}
		srv.Secret = sealed
	}
	return srv, nil
}

func (s *AuthService) ListRadiusServers(ctx context.Context) ([]models.RadiusServer, error) {
	return s.repo.ListRadiusServers(ctx, false)
}

func (s *AuthService) GetRadiusServer(ctx context.Context, id int) (*models.RadiusServer, error) {
	return s.repo.GetRadiusServer(ctx, id)
}

func (s *AuthService) CreateRadiusServer(ctx context.Context, in RadiusInput) (int, error) {
	srv, err := s.prepareRadius(in, true)
	if err != nil {
		return 0, err
	}
	id, err := s.repo.CreateRadiusServer(ctx, srv)
	if errors.Is(err, repository.ErrConflict) {
		return 0, invalid("a RADIUS server named %q already exists", srv.Name)
	}
	return id, err
}

func (s *AuthService) UpdateRadiusServer(ctx context.Context, id int, in RadiusInput) (bool, error) {
	srv, err := s.prepareRadius(in, false)
	if err != nil {
		return false, err
	}
	srv.ID = id
	ok, err := s.repo.UpdateRadiusServer(ctx, srv)
	if errors.Is(err, repository.ErrConflict) {
		return false, invalid("a RADIUS server named %q already exists", srv.Name)
	}
	return ok, err
}

func (s *AuthService) DeleteRadiusServer(ctx context.Context, id int) (bool, error) {
	return s.repo.DeleteRadiusServer(ctx, id)
}

func (s *AuthService) SetRadiusServerEnabled(ctx context.Context, id int, enabled bool) (bool, error) {
	return s.repo.SetRadiusServerEnabled(ctx, id, enabled)
}

func (s *AuthService) radiusClient(srv models.RadiusServer) (auth.RadiusServer, error) {
	secret, err := s.box.Open(srv.Secret)
	if err != nil {
		return auth.RadiusServer{}, fmt.Errorf("%s: %w", srv.Name, err)
	}
	return auth.RadiusServer{
		Name:                        srv.Name,
		Host:                        srv.Host,
		Port:                        srv.Port,
		Secret:                      secret,
		Timeout:                     time.Duration(srv.TimeoutSeconds) * time.Second,
		Retries:                     srv.Retries,
		NASIdentifier:               srv.NASIdentifier,
		RequireMessageAuthenticator: srv.RequireMessageAuthenticator,
	}, nil
}

func (s *AuthService) radiusClients(ctx context.Context) ([]auth.RadiusServer, error) {
	servers, err := s.repo.ListRadiusServers(ctx, true)
	if err != nil {
		return nil, err
	}
	out := make([]auth.RadiusServer, 0, len(servers))
	for _, srv := range servers {
		c, err := s.radiusClient(srv)
		if err != nil {
			log.Printf("auth: skip RADIUS server: %v", err)
			continue
		}
		out = append(out, c)
	}
	return out, nil
}

// RadiusTestResult is the outcome of the admin "test server" action.
type RadiusTestResult struct {
	Accepted     bool   `json:"accepted"`
	ReplyMessage string `json:"reply_message,omitempty"`
	Error        string `json:"error,omitempty"`
	DurationMS   int64  `json:"duration_ms"`
}

// TestRadiusServer sends one Access-Request to a single server.
func (s *AuthService) TestRadiusServer(ctx context.Context, id int, username, password string) (*RadiusTestResult, error) {
	srv, err := s.repo.GetRadiusServer(ctx, id)
	if err != nil || srv == nil {
		return nil, err
	}
	client, err := s.radiusClient(*srv)
	if err != nil {
		return &RadiusTestResult{Error: err.Error()}, nil
	}
	start := time.Now()
	res, err := auth.RadiusAuthenticate(ctx, []auth.RadiusServer{client}, username, password)
	out := &RadiusTestResult{DurationMS: time.Since(start).Milliseconds()}
	if err != nil {
		out.Error = err.Error()
		return out, nil
	}
	out.Accepted = res.Accepted
	out.ReplyMessage = res.ReplyMessage
	return out, nil
}
