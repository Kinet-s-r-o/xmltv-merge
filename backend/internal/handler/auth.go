package handler

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"xmltv-merge/internal/auth"
	"xmltv-merge/internal/models"
	"xmltv-merge/internal/service"
)

// SessionCookieName holds the opaque session token (HttpOnly, SameSite=Strict).
const SessionCookieName = "xmltv_session"

// CSRFHeader must echo the session's CSRF token on every state-changing request.
const CSRFHeader = "X-CSRF-Token"

// AuthHTTPSettings configures cookie and client address handling.
type AuthHTTPSettings struct {
	// CookieSecure is "auto" (Secure when the request arrived over HTTPS,
	// directly or via X-Forwarded-Proto), "true" or "false".
	CookieSecure string
	// TrustProxyHeaders uses X-Real-IP / X-Forwarded-For as the client address.
	TrustProxyHeaders bool
}

// AuthHandler serves sign-in, the own account and user/role/RADIUS administration.
type AuthHandler struct {
	svc      *service.AuthService
	settings AuthHTTPSettings
}

func NewAuthHandler(svc *service.AuthService, settings AuthHTTPSettings) *AuthHandler {
	return &AuthHandler{svc: svc, settings: settings}
}

type principalKey struct{}

// PrincipalFrom returns the authenticated principal of a request.
func PrincipalFrom(ctx context.Context) *service.Principal {
	p, _ := ctx.Value(principalKey{}).(*service.Principal)
	return p
}

func (a *AuthHandler) clientIP(r *http.Request) string {
	if a.settings.TrustProxyHeaders {
		if ip := strings.TrimSpace(r.Header.Get("X-Real-IP")); ip != "" {
			return ip
		}
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			return strings.TrimSpace(strings.Split(xff, ",")[0])
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func (a *AuthHandler) secureCookie(r *http.Request) bool {
	switch strings.ToLower(a.settings.CookieSecure) {
	case "true", "1", "yes", "on":
		return true
	case "false", "0", "no", "off":
		return false
	}
	return r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

func (a *AuthHandler) setSessionCookie(w http.ResponseWriter, r *http.Request, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   a.secureCookie(r),
		SameSite: http.SameSiteStrictMode,
	})
}

func (a *AuthHandler) clearSessionCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   a.secureCookie(r),
		SameSite: http.SameSiteStrictMode,
	})
}

func sessionToken(r *http.Request) string {
	c, err := r.Cookie(SessionCookieName)
	if err != nil {
		return ""
	}
	return c.Value
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// writeAuthError maps service errors; validation messages are shown as-is,
// other errors are logged and replaced by a generic message.
func writeAuthError(w http.ResponseWriter, err error) {
	switch {
	case service.IsValidation(err):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, service.ErrInvalidCredentials), errors.Is(err, service.ErrInvalidCode), errors.Is(err, service.ErrChallengeExpired):
		writeError(w, http.StatusUnauthorized, err.Error())
	case errors.Is(err, service.ErrTooManyAttempts):
		writeError(w, http.StatusTooManyRequests, err.Error())
	case errors.Is(err, service.ErrAuthServerDown):
		writeError(w, http.StatusServiceUnavailable, err.Error())
	case errors.Is(err, service.ErrSetupDone):
		writeError(w, http.StatusConflict, err.Error())
	default:
		log.Printf("auth: %v", err)
		writeError(w, http.StatusInternalServerError, "the request could not be completed; see the server log")
	}
}

func decodeJSON(w http.ResponseWriter, r *http.Request, limit int64, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, limit))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return false
	}
	return true
}

// ---- Middleware -----------------------------------------------------------

// RequireAuth rejects requests without a valid session (401) and
// state-changing requests without the session's CSRF token (403).
func (a *AuthHandler) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		p, err := a.svc.Authenticate(r.Context(), sessionToken(r))
		if err != nil {
			log.Printf("auth: authenticate: %v", err)
			writeError(w, http.StatusInternalServerError, "the session could not be checked")
			return
		}
		if p == nil {
			a.clearSessionCookie(w, r)
			writeError(w, http.StatusUnauthorized, "sign in to continue")
			return
		}
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
		default:
			header := r.Header.Get(CSRFHeader)
			if header == "" || subtle.ConstantTimeCompare([]byte(header), []byte(p.Session.CSRFToken)) != 1 {
				writeError(w, http.StatusForbidden, "the request is missing a valid CSRF token; reload the page")
				return
			}
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), principalKey{}, p)))
	})
}

var actionVerb = map[auth.Action]string{
	auth.ActionRead:   "view",
	auth.ActionEdit:   "change",
	auth.ActionDelete: "delete in",
	auth.ActionImport: "import into",
	auth.ActionExport: "export from",
}

// Allow requires action on at least one of sections (403 otherwise).
func Allow(action auth.Action, sections ...auth.Section) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p := PrincipalFrom(r.Context())
			for _, s := range sections {
				if p.Can(s, action) {
					next.ServeHTTP(w, r)
					return
				}
			}
			names := make([]string, len(sections))
			for i, s := range sections {
				names[i] = string(s)
			}
			writeError(w, http.StatusForbidden, "your role does not allow you to "+actionVerb[action]+" "+strings.Join(names, " / "))
		})
	}
}

// ---- Public sign-in endpoints --------------------------------------------

type meResponse struct {
	User        *models.User     `json:"user"`
	Permissions auth.Permissions `json:"permissions"`
	CSRFToken   string           `json:"csrf_token"`
}

func (a *AuthHandler) Status(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	required, err := a.svc.SetupRequired(r.Context())
	if err != nil {
		writeAuthError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"setup_required": required})
}

func (a *AuthHandler) Setup(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Username    string `json:"username"`
		DisplayName string `json:"display_name"`
		Password    string `json:"password"`
	}
	if !decodeJSON(w, r, 16<<10, &in) {
		return
	}
	user, err := a.svc.Setup(r.Context(), in.Username, in.Password, in.DisplayName)
	if err != nil {
		writeAuthError(w, err)
		return
	}
	log.Printf("auth: first administrator %q created from %s", user.Username, a.clientIP(r))
	a.finishLogin(w, r, user.Username, in.Password)
}

func (a *AuthHandler) finishLogin(w http.ResponseWriter, r *http.Request, username, password string) {
	res, err := a.svc.Login(r.Context(), username, password, a.clientIP(r), r.UserAgent())
	if err != nil {
		writeAuthError(w, err)
		return
	}
	a.writeLoginResult(w, r, res)
}

func (a *AuthHandler) writeLoginResult(w http.ResponseWriter, r *http.Request, res *service.LoginResult) {
	w.Header().Set("Cache-Control", "no-store")
	switch res.Status {
	case "ok":
		a.setSessionCookie(w, r, res.SessionToken)
		p, err := a.svc.Authenticate(r.Context(), res.SessionToken)
		if err != nil || p == nil {
			writeAuthError(w, errors.New("session was not created"))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"status": "ok", "user": p.User, "permissions": p.Permissions, "csrf_token": p.Session.CSRFToken,
		})
	case "totp_setup_required":
		writeJSON(w, http.StatusOK, map[string]any{
			"status": res.Status, "challenge": res.Challenge, "totp_secret": res.TOTPSecret, "totp_uri": res.TOTPURI,
		})
	default:
		writeJSON(w, http.StatusOK, map[string]any{"status": res.Status, "challenge": res.Challenge})
	}
}

func (a *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, 16<<10, &in) {
		return
	}
	a.finishLogin(w, r, in.Username, in.Password)
}

func (a *AuthHandler) LoginVerify(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Challenge string `json:"challenge"`
		Code      string `json:"code"`
	}
	if !decodeJSON(w, r, 4<<10, &in) {
		return
	}
	res, err := a.svc.VerifyChallenge(r.Context(), in.Challenge, in.Code, a.clientIP(r), r.UserAgent())
	if err != nil {
		writeAuthError(w, err)
		return
	}
	a.writeLoginResult(w, r, res)
}

// Logout ends the current session; it is public so an expired session can
// still clear its cookie.
func (a *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	token := sessionToken(r)
	if p, err := a.svc.Authenticate(r.Context(), token); err == nil && p != nil {
		if subtle.ConstantTimeCompare([]byte(r.Header.Get(CSRFHeader)), []byte(p.Session.CSRFToken)) != 1 {
			writeError(w, http.StatusForbidden, "the request is missing a valid CSRF token; reload the page")
			return
		}
		if err := a.svc.Logout(r.Context(), token); err != nil {
			writeAuthError(w, err)
			return
		}
		log.Printf("auth: %q signed out", p.User.Username)
	}
	a.clearSessionCookie(w, r)
	w.WriteHeader(http.StatusNoContent)
}

// ---- Own account ----------------------------------------------------------

func (a *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	p := PrincipalFrom(r.Context())
	writeJSON(w, http.StatusOK, meResponse{User: p.User, Permissions: p.Permissions, CSRFToken: p.Session.CSRFToken})
}

func (a *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if !decodeJSON(w, r, 16<<10, &in) {
		return
	}
	if err := a.svc.ChangePassword(r.Context(), PrincipalFrom(r.Context()), in.CurrentPassword, in.NewPassword); err != nil {
		writeAuthError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *AuthHandler) BeginTOTP(w http.ResponseWriter, r *http.Request) {
	secret, uri, err := a.svc.BeginTOTPEnrollment(PrincipalFrom(r.Context()))
	if err != nil {
		writeAuthError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"totp_secret": secret, "totp_uri": uri})
}

func (a *AuthHandler) EnableTOTP(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Code string `json:"code"`
	}
	if !decodeJSON(w, r, 4<<10, &in) {
		return
	}
	if err := a.svc.ConfirmTOTPEnrollment(r.Context(), PrincipalFrom(r.Context()), in.Code); err != nil {
		writeAuthError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *AuthHandler) DisableTOTP(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Code string `json:"code"`
	}
	if !decodeJSON(w, r, 4<<10, &in) {
		return
	}
	if err := a.svc.DisableOwnTOTP(r.Context(), PrincipalFrom(r.Context()), in.Code); err != nil {
		writeAuthError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- Users ----------------------------------------------------------------

func pathID(w http.ResponseWriter, r *http.Request, what string) (int, bool) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "invalid "+what+" id")
		return 0, false
	}
	return id, true
}

func (a *AuthHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := a.svc.ListUsers(r.Context())
	if err != nil {
		writeAuthError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, users)
}

func (a *AuthHandler) GetUser(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "user")
	if !ok {
		return
	}
	user, err := a.svc.GetUser(r.Context(), id)
	if err != nil {
		writeAuthError(w, err)
		return
	}
	if user == nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (a *AuthHandler) CreateUser(w http.ResponseWriter, r *http.Request) {
	var in service.UserInput
	if !decodeJSON(w, r, 16<<10, &in) {
		return
	}
	id, err := a.svc.CreateUser(r.Context(), in)
	if err != nil {
		writeAuthError(w, err)
		return
	}
	log.Printf("auth: %q created user %q (%s)", PrincipalFrom(r.Context()).User.Username, in.Username, in.AuthType)
	writeJSON(w, http.StatusCreated, map[string]int{"id": id})
}

func (a *AuthHandler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "user")
	if !ok {
		return
	}
	var in service.UserInput
	if !decodeJSON(w, r, 16<<10, &in) {
		return
	}
	updated, err := a.svc.UpdateUser(r.Context(), PrincipalFrom(r.Context()), id, in)
	if err != nil {
		writeAuthError(w, err)
		return
	}
	if !updated {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	log.Printf("auth: %q updated user %q", PrincipalFrom(r.Context()).User.Username, in.Username)
	w.WriteHeader(http.StatusNoContent)
}

func (a *AuthHandler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "user")
	if !ok {
		return
	}
	deleted, err := a.svc.DeleteUser(r.Context(), PrincipalFrom(r.Context()), id)
	if err != nil {
		writeAuthError(w, err)
		return
	}
	if !deleted {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	log.Printf("auth: %q deleted user id %d", PrincipalFrom(r.Context()).User.Username, id)
	w.WriteHeader(http.StatusNoContent)
}

func (a *AuthHandler) ResetUserTOTP(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "user")
	if !ok {
		return
	}
	done, err := a.svc.ResetUserTOTP(r.Context(), id)
	if err != nil {
		writeAuthError(w, err)
		return
	}
	if !done {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	log.Printf("auth: %q reset two-factor authentication of user id %d", PrincipalFrom(r.Context()).User.Username, id)
	w.WriteHeader(http.StatusNoContent)
}

func (a *AuthHandler) UnlockUser(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "user")
	if !ok {
		return
	}
	done, err := a.svc.UnlockUser(r.Context(), id)
	if err != nil {
		writeAuthError(w, err)
		return
	}
	if !done {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- Roles ----------------------------------------------------------------

func (a *AuthHandler) ListRoles(w http.ResponseWriter, r *http.Request) {
	roles, err := a.svc.ListRoles(r.Context())
	if err != nil {
		writeAuthError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, roles)
}

func (a *AuthHandler) CreateRole(w http.ResponseWriter, r *http.Request) {
	var in service.RoleInput
	if !decodeJSON(w, r, 64<<10, &in) {
		return
	}
	id, err := a.svc.CreateRole(r.Context(), in)
	if err != nil {
		writeAuthError(w, err)
		return
	}
	log.Printf("auth: %q created role %q", PrincipalFrom(r.Context()).User.Username, in.Name)
	writeJSON(w, http.StatusCreated, map[string]int{"id": id})
}

func (a *AuthHandler) UpdateRole(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "role")
	if !ok {
		return
	}
	var in service.RoleInput
	if !decodeJSON(w, r, 64<<10, &in) {
		return
	}
	updated, err := a.svc.UpdateRole(r.Context(), id, in)
	if err != nil {
		writeAuthError(w, err)
		return
	}
	if !updated {
		writeError(w, http.StatusNotFound, "role not found")
		return
	}
	log.Printf("auth: %q updated role %q", PrincipalFrom(r.Context()).User.Username, in.Name)
	w.WriteHeader(http.StatusNoContent)
}

func (a *AuthHandler) DeleteRole(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "role")
	if !ok {
		return
	}
	deleted, err := a.svc.DeleteRole(r.Context(), id)
	if err != nil {
		writeAuthError(w, err)
		return
	}
	if !deleted {
		writeError(w, http.StatusNotFound, "role not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- RADIUS servers -------------------------------------------------------

func (a *AuthHandler) ListRadiusServers(w http.ResponseWriter, r *http.Request) {
	servers, err := a.svc.ListRadiusServers(r.Context())
	if err != nil {
		writeAuthError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, servers)
}

func (a *AuthHandler) CreateRadiusServer(w http.ResponseWriter, r *http.Request) {
	var in service.RadiusInput
	if !decodeJSON(w, r, 16<<10, &in) {
		return
	}
	id, err := a.svc.CreateRadiusServer(r.Context(), in)
	if err != nil {
		writeAuthError(w, err)
		return
	}
	log.Printf("auth: %q added RADIUS server %q", PrincipalFrom(r.Context()).User.Username, in.Name)
	writeJSON(w, http.StatusCreated, map[string]int{"id": id})
}

func (a *AuthHandler) UpdateRadiusServer(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "RADIUS server")
	if !ok {
		return
	}
	var in service.RadiusInput
	if !decodeJSON(w, r, 16<<10, &in) {
		return
	}
	updated, err := a.svc.UpdateRadiusServer(r.Context(), id, in)
	if err != nil {
		writeAuthError(w, err)
		return
	}
	if !updated {
		writeError(w, http.StatusNotFound, "RADIUS server not found")
		return
	}
	log.Printf("auth: %q updated RADIUS server %q", PrincipalFrom(r.Context()).User.Username, in.Name)
	w.WriteHeader(http.StatusNoContent)
}

func (a *AuthHandler) DeleteRadiusServer(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "RADIUS server")
	if !ok {
		return
	}
	deleted, err := a.svc.DeleteRadiusServer(r.Context(), id)
	if err != nil {
		writeAuthError(w, err)
		return
	}
	if !deleted {
		writeError(w, http.StatusNotFound, "RADIUS server not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *AuthHandler) SetRadiusServerEnabled(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "RADIUS server")
	if !ok {
		return
	}
	var in struct {
		Enabled bool `json:"enabled"`
	}
	if !decodeJSON(w, r, 1<<10, &in) {
		return
	}
	done, err := a.svc.SetRadiusServerEnabled(r.Context(), id, in.Enabled)
	if err != nil {
		writeAuthError(w, err)
		return
	}
	if !done {
		writeError(w, http.StatusNotFound, "RADIUS server not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *AuthHandler) TestRadiusServer(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "RADIUS server")
	if !ok {
		return
	}
	var in struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, 4<<10, &in) {
		return
	}
	if strings.TrimSpace(in.Username) == "" || in.Password == "" {
		writeError(w, http.StatusBadRequest, "user name and password are required for the test")
		return
	}
	res, err := a.svc.TestRadiusServer(r.Context(), id, strings.TrimSpace(in.Username), in.Password)
	if err != nil {
		writeAuthError(w, err)
		return
	}
	if res == nil {
		writeError(w, http.StatusNotFound, "RADIUS server not found")
		return
	}
	writeJSON(w, http.StatusOK, res)
}
