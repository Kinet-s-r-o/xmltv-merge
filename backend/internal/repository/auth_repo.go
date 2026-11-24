package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"xmltv-merge/internal/auth"
	"xmltv-merge/internal/models"
)

// ErrConflict reports a unique constraint violation (duplicate name).
var ErrConflict = errors.New("already exists")

// ErrInUse reports a record that cannot be deleted because others reference it.
var ErrInUse = errors.New("in use")

// AuthRepository persists users, roles, sessions and RADIUS servers.
type AuthRepository struct {
	db *pgxpool.Pool
}

func NewAuthRepository(db *pgxpool.Pool) *AuthRepository {
	return &AuthRepository{db: db}
}

func mapPgError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505":
			return ErrConflict
		case "23503":
			return ErrInUse
		}
	}
	return err
}

// ---- Users ----------------------------------------------------------------

const userColumns = `u.id, u.username, u.display_name, u.email, u.auth_type, u.role_id, r.name,
	u.enabled, u.totp_required, u.totp_enabled, u.locked_until, u.last_login_at, u.created_at, u.updated_at,
	u.password_hash, u.totp_secret, u.totp_last_step, u.failed_logins`

func scanUser(row pgx.Row) (*models.User, error) {
	var u models.User
	err := row.Scan(&u.ID, &u.Username, &u.DisplayName, &u.Email, &u.AuthType, &u.RoleID, &u.RoleName,
		&u.Enabled, &u.TOTPRequired, &u.TOTPEnabled, &u.LockedUntil, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt,
		&u.PasswordHash, &u.TOTPSecret, &u.TOTPLastStep, &u.FailedLogins)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *AuthRepository) CountUsers(ctx context.Context) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `SELECT count(*) FROM users`).Scan(&n)
	return n, err
}

func (r *AuthRepository) ListUsers(ctx context.Context) ([]models.User, error) {
	rows, err := r.db.Query(ctx, `SELECT `+userColumns+` FROM users u JOIN roles r ON r.id = u.role_id ORDER BY lower(u.username)`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := []models.User{}
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		users = append(users, *u)
	}
	return users, rows.Err()
}

func (r *AuthRepository) GetUser(ctx context.Context, id int) (*models.User, error) {
	u, err := scanUser(r.db.QueryRow(ctx, `SELECT `+userColumns+` FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return u, err
}

func (r *AuthRepository) GetUserByUsername(ctx context.Context, username string) (*models.User, error) {
	u, err := scanUser(r.db.QueryRow(ctx, `SELECT `+userColumns+` FROM users u JOIN roles r ON r.id = u.role_id WHERE lower(u.username) = lower($1)`, username))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return u, err
}

// CreateUser inserts a user; PasswordHash and TOTP fields are taken as given.
func (r *AuthRepository) CreateUser(ctx context.Context, u *models.User) (int, error) {
	var id int
	err := r.db.QueryRow(ctx,
		`INSERT INTO users (username, display_name, email, auth_type, password_hash, role_id, enabled, totp_required, password_changed_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $5::text = '' THEN NULL ELSE now() END)
		 RETURNING id`,
		u.Username, u.DisplayName, u.Email, u.AuthType, u.PasswordHash, u.RoleID, u.Enabled, u.TOTPRequired,
	).Scan(&id)
	return id, mapPgError(err)
}

// UpdateUser saves profile, type, role and flags. A non-empty PasswordHash
// replaces the stored one; switching to remote clears the local password.
func (r *AuthRepository) UpdateUser(ctx context.Context, u *models.User) (bool, error) {
	tag, err := r.db.Exec(ctx,
		`UPDATE users SET username = $2, display_name = $3, email = $4, auth_type = $5::text, role_id = $6,
			enabled = $7, totp_required = $8,
			password_hash = CASE WHEN $5::text = 'remote' THEN '' WHEN $9::text <> '' THEN $9::text ELSE password_hash END,
			password_changed_at = CASE WHEN $5::text = 'local' AND $9::text <> '' THEN now() ELSE password_changed_at END,
			updated_at = now()
		 WHERE id = $1`,
		u.ID, u.Username, u.DisplayName, u.Email, u.AuthType, u.RoleID, u.Enabled, u.TOTPRequired, u.PasswordHash)
	if err != nil {
		return false, mapPgError(err)
	}
	return tag.RowsAffected() > 0, nil
}

func (r *AuthRepository) DeleteUser(ctx context.Context, id int) (bool, error) {
	tag, err := r.db.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (r *AuthRepository) SetPassword(ctx context.Context, id int, hash string) error {
	_, err := r.db.Exec(ctx, `UPDATE users SET password_hash = $2, password_changed_at = now(), updated_at = now() WHERE id = $1`, id, hash)
	return err
}

// RecordLoginFailure increments the failure counter and locks the account
// for lockFor once it reaches lockAfter consecutive failures.
func (r *AuthRepository) RecordLoginFailure(ctx context.Context, id, lockAfter int, lockFor time.Duration) error {
	_, err := r.db.Exec(ctx,
		`UPDATE users SET failed_logins = failed_logins + 1,
			locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + make_interval(secs => $3) ELSE locked_until END
		 WHERE id = $1`, id, lockAfter, lockFor.Seconds())
	return err
}

func (r *AuthRepository) RecordLoginSuccess(ctx context.Context, id int) error {
	_, err := r.db.Exec(ctx, `UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`, id)
	return err
}

// UnlockUser clears a lockout.
func (r *AuthRepository) UnlockUser(ctx context.Context, id int) error {
	_, err := r.db.Exec(ctx, `UPDATE users SET failed_logins = 0, locked_until = NULL, updated_at = now() WHERE id = $1`, id)
	return err
}

// SetTOTP stores a (sealed) secret and the enabled flag; an empty secret resets 2FA.
func (r *AuthRepository) SetTOTP(ctx context.Context, id int, sealedSecret string, enabled bool, lastStep int64) error {
	_, err := r.db.Exec(ctx,
		`UPDATE users SET totp_secret = $2, totp_enabled = $3, totp_last_step = $4, updated_at = now() WHERE id = $1`,
		id, sealedSecret, enabled, lastStep)
	return err
}

// ConsumeTOTPStep atomically records a used step; it fails when the step is
// not newer than the last one, so a code can only be used once.
func (r *AuthRepository) ConsumeTOTPStep(ctx context.Context, id int, step int64) (bool, error) {
	tag, err := r.db.Exec(ctx, `UPDATE users SET totp_last_step = $2 WHERE id = $1 AND totp_last_step < $2`, id, step)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// ---- Roles ----------------------------------------------------------------

func (r *AuthRepository) RolePermissions(ctx context.Context, roleID int) (auth.Permissions, error) {
	rows, err := r.db.Query(ctx,
		`SELECT section, full_access, can_read, can_edit, can_delete, can_import, can_export
		 FROM role_permissions WHERE role_id = $1`, roleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	perms := auth.Permissions{}
	for rows.Next() {
		var section string
		var p auth.Permission
		if err := rows.Scan(&section, &p.Full, &p.Read, &p.Edit, &p.Delete, &p.Import, &p.Export); err != nil {
			return nil, err
		}
		if auth.ValidSection(auth.Section(section)) {
			perms[auth.Section(section)] = p.Normalize()
		}
	}
	return perms.Complete(), rows.Err()
}

func (r *AuthRepository) ListRoles(ctx context.Context) ([]models.Role, error) {
	rows, err := r.db.Query(ctx,
		`SELECT r.id, r.name, r.description, r.builtin, r.created_at, r.updated_at,
			(SELECT count(*) FROM users u WHERE u.role_id = r.id)
		 FROM roles r ORDER BY r.builtin DESC, lower(r.name)`)
	if err != nil {
		return nil, err
	}
	roles := []models.Role{}
	for rows.Next() {
		var role models.Role
		if err := rows.Scan(&role.ID, &role.Name, &role.Description, &role.Builtin, &role.CreatedAt, &role.UpdatedAt, &role.UserCount); err != nil {
			rows.Close()
			return nil, err
		}
		roles = append(roles, role)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range roles {
		if roles[i].Permissions, err = r.RolePermissions(ctx, roles[i].ID); err != nil {
			return nil, err
		}
	}
	return roles, nil
}

func (r *AuthRepository) GetRole(ctx context.Context, id int) (*models.Role, error) {
	var role models.Role
	err := r.db.QueryRow(ctx,
		`SELECT r.id, r.name, r.description, r.builtin, r.created_at, r.updated_at,
			(SELECT count(*) FROM users u WHERE u.role_id = r.id)
		 FROM roles r WHERE r.id = $1`, id,
	).Scan(&role.ID, &role.Name, &role.Description, &role.Builtin, &role.CreatedAt, &role.UpdatedAt, &role.UserCount)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	role.Permissions, err = r.RolePermissions(ctx, id)
	return &role, err
}

func (r *AuthRepository) savePermissions(ctx context.Context, tx pgx.Tx, roleID int, perms auth.Permissions) error {
	if _, err := tx.Exec(ctx, `DELETE FROM role_permissions WHERE role_id = $1`, roleID); err != nil {
		return err
	}
	for _, section := range auth.Sections {
		p := perms[section].Normalize()
		if !p.Read {
			continue
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO role_permissions (role_id, section, full_access, can_read, can_edit, can_delete, can_import, can_export)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			roleID, string(section), p.Full, p.Read, p.Edit, p.Delete, p.Import, p.Export); err != nil {
			return err
		}
	}
	return nil
}

func (r *AuthRepository) CreateRole(ctx context.Context, name, description string, perms auth.Permissions) (int, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	var id int
	if err := tx.QueryRow(ctx, `INSERT INTO roles (name, description) VALUES ($1, $2) RETURNING id`, name, description).Scan(&id); err != nil {
		return 0, mapPgError(err)
	}
	if err := r.savePermissions(ctx, tx, id, perms); err != nil {
		return 0, err
	}
	return id, tx.Commit(ctx)
}

// UpdateRole saves name, description and permissions. Built-in roles keep
// their permissions (perms is ignored for them).
func (r *AuthRepository) UpdateRole(ctx context.Context, id int, name, description string, perms auth.Permissions) (bool, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	var builtin bool
	err = tx.QueryRow(ctx, `UPDATE roles SET name = $2, description = $3, updated_at = now() WHERE id = $1 RETURNING builtin`, id, name, description).Scan(&builtin)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, mapPgError(err)
	}
	if !builtin {
		if err := r.savePermissions(ctx, tx, id, perms); err != nil {
			return false, err
		}
	}
	return true, tx.Commit(ctx)
}

// DeleteRole removes a custom role; built-in roles and roles with users fail with ErrInUse.
func (r *AuthRepository) DeleteRole(ctx context.Context, id int) (bool, error) {
	tag, err := r.db.Exec(ctx, `DELETE FROM roles WHERE id = $1 AND NOT builtin`, id)
	if err != nil {
		return false, mapPgError(err)
	}
	return tag.RowsAffected() > 0, nil
}

// BuiltinAdminRoleID returns the id of the built-in Administrator role.
func (r *AuthRepository) BuiltinAdminRoleID(ctx context.Context) (int, error) {
	var id int
	err := r.db.QueryRow(ctx, `SELECT id FROM roles WHERE builtin ORDER BY id LIMIT 1`).Scan(&id)
	return id, err
}

// CountActiveAdmins counts enabled users in the built-in Administrator role,
// optionally excluding one user.
func (r *AuthRepository) CountActiveAdmins(ctx context.Context, excludeUserID int) (int, error) {
	var n int
	err := r.db.QueryRow(ctx,
		`SELECT count(*) FROM users u JOIN roles r ON r.id = u.role_id WHERE r.builtin AND u.enabled AND u.id <> $1`,
		excludeUserID).Scan(&n)
	return n, err
}

// ---- Sessions -------------------------------------------------------------

func (r *AuthRepository) CreateSession(ctx context.Context, s *models.Session, remoteAddr, userAgent string) error {
	if len(userAgent) > 300 {
		userAgent = userAgent[:300]
	}
	if len(remoteAddr) > 64 {
		remoteAddr = remoteAddr[:64]
	}
	_, err := r.db.Exec(ctx,
		`INSERT INTO user_sessions (token_hash, user_id, csrf_token, expires_at, remote_addr, user_agent)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		s.TokenHash, s.UserID, s.CSRFToken, s.ExpiresAt, remoteAddr, userAgent)
	return err
}

// GetSession returns a non-expired session and its user.
func (r *AuthRepository) GetSession(ctx context.Context, tokenHash string) (*models.Session, *models.User, error) {
	var s models.Session
	row := r.db.QueryRow(ctx,
		`SELECT s.token_hash, s.user_id, s.csrf_token, s.created_at, s.last_seen_at, s.expires_at, `+userColumns+`
		 FROM user_sessions s JOIN users u ON u.id = s.user_id JOIN roles r ON r.id = u.role_id
		 WHERE s.token_hash = $1 AND s.expires_at > now()`, tokenHash)
	var u models.User
	err := row.Scan(&s.TokenHash, &s.UserID, &s.CSRFToken, &s.CreatedAt, &s.LastSeenAt, &s.ExpiresAt,
		&u.ID, &u.Username, &u.DisplayName, &u.Email, &u.AuthType, &u.RoleID, &u.RoleName,
		&u.Enabled, &u.TOTPRequired, &u.TOTPEnabled, &u.LockedUntil, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt,
		&u.PasswordHash, &u.TOTPSecret, &u.TOTPLastStep, &u.FailedLogins)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, nil
	}
	if err != nil {
		return nil, nil, err
	}
	return &s, &u, nil
}

// TouchSession records activity and extends an idle-timeout session up to its absolute limit.
func (r *AuthRepository) TouchSession(ctx context.Context, tokenHash string, expiresAt time.Time) error {
	_, err := r.db.Exec(ctx, `UPDATE user_sessions SET last_seen_at = now(), expires_at = $2 WHERE token_hash = $1`, tokenHash, expiresAt)
	return err
}

func (r *AuthRepository) DeleteSession(ctx context.Context, tokenHash string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM user_sessions WHERE token_hash = $1`, tokenHash)
	return err
}

// DeleteUserSessions signs a user out everywhere except the session exceptHash.
func (r *AuthRepository) DeleteUserSessions(ctx context.Context, userID int, exceptHash string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM user_sessions WHERE user_id = $1 AND token_hash <> $2`, userID, exceptHash)
	return err
}

func (r *AuthRepository) DeleteExpiredSessions(ctx context.Context) (int64, error) {
	tag, err := r.db.Exec(ctx, `DELETE FROM user_sessions WHERE expires_at <= now()`)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// ---- RADIUS servers -------------------------------------------------------

const radiusColumns = `id, name, host, port, secret, timeout_seconds, retries, nas_identifier, priority,
	require_message_authenticator, enabled, created_at, updated_at`

func scanRadius(row pgx.Row) (*models.RadiusServer, error) {
	var s models.RadiusServer
	err := row.Scan(&s.ID, &s.Name, &s.Host, &s.Port, &s.Secret, &s.TimeoutSeconds, &s.Retries, &s.NASIdentifier,
		&s.Priority, &s.RequireMessageAuthenticator, &s.Enabled, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		return nil, err
	}
	s.HasSecret = s.Secret != ""
	return &s, nil
}

// ListRadiusServers returns servers in the order they are tried (priority, id).
func (r *AuthRepository) ListRadiusServers(ctx context.Context, onlyEnabled bool) ([]models.RadiusServer, error) {
	query := `SELECT ` + radiusColumns + ` FROM radius_servers`
	if onlyEnabled {
		query += ` WHERE enabled`
	}
	rows, err := r.db.Query(ctx, query+` ORDER BY priority, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	servers := []models.RadiusServer{}
	for rows.Next() {
		s, err := scanRadius(rows)
		if err != nil {
			return nil, err
		}
		servers = append(servers, *s)
	}
	return servers, rows.Err()
}

func (r *AuthRepository) GetRadiusServer(ctx context.Context, id int) (*models.RadiusServer, error) {
	s, err := scanRadius(r.db.QueryRow(ctx, `SELECT `+radiusColumns+` FROM radius_servers WHERE id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return s, err
}

func (r *AuthRepository) CreateRadiusServer(ctx context.Context, s *models.RadiusServer) (int, error) {
	if s.Secret == "" {
		return 0, fmt.Errorf("shared secret is required")
	}
	var id int
	err := r.db.QueryRow(ctx,
		`INSERT INTO radius_servers (name, host, port, secret, timeout_seconds, retries, nas_identifier, priority, require_message_authenticator, enabled)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
		s.Name, s.Host, s.Port, s.Secret, s.TimeoutSeconds, s.Retries, s.NASIdentifier, s.Priority, s.RequireMessageAuthenticator, s.Enabled,
	).Scan(&id)
	return id, mapPgError(err)
}

// UpdateRadiusServer saves a server; an empty Secret keeps the stored one.
func (r *AuthRepository) UpdateRadiusServer(ctx context.Context, s *models.RadiusServer) (bool, error) {
	tag, err := r.db.Exec(ctx,
		`UPDATE radius_servers SET name = $2, host = $3, port = $4,
			secret = CASE WHEN $5::text = '' THEN secret ELSE $5::text END,
			timeout_seconds = $6, retries = $7, nas_identifier = $8, priority = $9,
			require_message_authenticator = $10, enabled = $11, updated_at = now()
		 WHERE id = $1`,
		s.ID, s.Name, s.Host, s.Port, s.Secret, s.TimeoutSeconds, s.Retries, s.NASIdentifier, s.Priority, s.RequireMessageAuthenticator, s.Enabled)
	if err != nil {
		return false, mapPgError(err)
	}
	return tag.RowsAffected() > 0, nil
}

func (r *AuthRepository) DeleteRadiusServer(ctx context.Context, id int) (bool, error) {
	tag, err := r.db.Exec(ctx, `DELETE FROM radius_servers WHERE id = $1`, id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (r *AuthRepository) SetRadiusServerEnabled(ctx context.Context, id int, enabled bool) (bool, error) {
	tag, err := r.db.Exec(ctx, `UPDATE radius_servers SET enabled = $2, updated_at = now() WHERE id = $1`, id, enabled)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}
