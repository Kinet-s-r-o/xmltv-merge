# Authentication, roles and RADIUS

Every `/api/v1` endpoint except the ones listed under *Public endpoints*
requires a signed-in session. Customer feeds (`/feeds/{slug}.xml?token=…`)
stay protected by their per-output token only.

## Sign-in flow

1. `GET /api/v1/auth/status` → `{ "setup_required": true }` while no user
   exists. The UI then shows *Create the first administrator*
   (`POST /api/v1/auth/setup`), which creates a local user in the built-in
   **Administrator** role and signs in. Setup is refused once any user
   exists. Alternatively set `ADMIN_USERNAME` / `ADMIN_PASSWORD`; the backend
   creates that administrator at startup when the user table is empty.
2. `POST /api/v1/auth/login {username, password}` answers one of:
   - `{status: "ok", user, permissions, csrf_token}` and sets the session cookie;
   - `{status: "totp_required", challenge}` — the user has 2FA enabled;
   - `{status: "totp_setup_required", challenge, totp_secret, totp_uri}` — an
     administrator requires 2FA and the user has not enrolled yet.
3. `POST /api/v1/auth/login/verify {challenge, code}` completes the second
   step (and enables 2FA for a setup challenge). Challenges live in memory
   for 5 minutes and allow 5 attempts.
4. `POST /api/v1/auth/logout` ends the session.

User names are matched case-insensitively. Local users are verified against a
PBKDF2-HMAC-SHA256 hash (600 000 iterations, random salt). Remote users are
verified by the RADIUS servers; there is no local password for them.

## Sessions and CSRF

- Cookie `xmltv_session`: random 256-bit token, `HttpOnly`,
  `SameSite=Strict`, `Path=/`, browser-session lifetime. Only its SHA-256
  hash is stored (`user_sessions`).
- `Secure` follows `AUTH_COOKIE_SECURE` (`auto` = when the request came over
  HTTPS directly or via `X-Forwarded-Proto: https`).
- Idle timeout `AUTH_SESSION_IDLE_MINUTES` (default 480), absolute lifetime
  `AUTH_SESSION_MAX_HOURS` (default 168). Expired sessions are purged every
  15 minutes.
- Every non-GET request must send `X-CSRF-Token` with the session's token
  (returned by login and `GET /api/v1/auth/me`); otherwise 403.
- Sessions end when a user is disabled, deleted, gets another role/type/
  password/user name, or when 2FA is reset or newly required. Changing your
  own password ends your other sessions.
- CORS is off by default (same origin through Nginx). `CORS_ALLOWED_ORIGINS`
  enables credentialed CORS for the listed origins only.

## Brute-force protection

- `AUTH_LOCKOUT_THRESHOLD` (default 5) consecutive failed passwords or TOTP
  codes lock the account for `AUTH_LOCKOUT_MINUTES` (default 15). An
  administrator can unlock it from the Users page.
- 30 failures from one client address within 15 minutes block further
  attempts from that address (HTTP 429). The address comes from `X-Real-IP` /
  `X-Forwarded-For` while `AUTH_TRUST_PROXY_HEADERS` is not `false`; set it to
  `false` when the backend is reachable without the Nginx proxy.
- Login errors are generic and unknown users cost the same time as wrong
  passwords.

## Two-factor authentication (TOTP)

RFC 6238, SHA-1, 6 digits, 30-second steps, ±1 step tolerance. A used step is
stored per user and every code is accepted only once. Users enroll under
*My account* (QR code + manual key, confirmed with a code); an administrator
can *Require 2FA* (enrollment at the next sign-in) or *Reset 2FA* (lost
device). A user cannot disable 2FA that an administrator requires.

## Roles and permissions

Sections: `dashboard`, `epg`, `channels`, `sources`, `outputs`, `multicast`,
`users`, `roles`, `radius`. Actions per section: `full`, `read`, `edit`,
`delete`, `import`, `export`. Full implies every action; any action implies
read. The built-in **Administrator** role always has full access, cannot be
deleted and its permissions cannot change; a role with users cannot be
deleted. The last enabled administrator cannot be disabled, deleted or moved
to another role, and nobody can disable, delete or change the role or type of
their own account.

Route → permission mapping lives in `backend/cmd/server/main.go`. Notable
choices: source refresh and activation need `sources:edit`; uploading an
XMLTV file (`POST /api/v1/import`) and XML configuration imports need
`import`; configuration exports, output XML preview and multicast TS dumps
need `export`; the source and channel lists are readable with read access to
any section that shows them (dashboard, EPG, channels, outputs, multicast);
the role list is readable with `users:read` so user forms can offer roles.

## RADIUS

- PAP Access-Request over UDP (RFC 2865) with `User-Name`, encrypted
  `User-Password`, `NAS-Identifier`, `Service-Type = Authenticate-Only`,
  `NAS-Port-Type = Virtual` and a `Message-Authenticator` (RFC 3579) as the
  first attribute.
- Responses must carry a valid Response Authenticator; a
  `Message-Authenticator` is verified when present and required when the
  server's *Require Message-Authenticator* option is on (default, BlastRADIUS
  / CVE-2024-3596 mitigation).
- Enabled servers are tried by ascending priority. A valid Access-Accept or
  Access-Reject ends the attempt; timeouts and invalid responses move on to
  the next server (each server: `timeout_seconds` × `retries + 1`). When no
  server answers, sign-in returns 503. Access-Challenge is treated as reject.
- The shared secret is write-only in the API (`has_secret`); an empty secret
  on update keeps the stored one. `POST /api/v1/radius-servers/{id}/test`
  sends one request with test credentials and reports Accept / Reject /
  error with the round-trip time.
- Add this application as a RADIUS client (its source address) with the same
  shared secret on the server.

## Secrets at rest

Set `AUTH_SECRET_KEY` (any long random string) to encrypt RADIUS shared
secrets and TOTP seeds with AES-256-GCM. Without it they are stored in plain
text and the backend logs a warning. Values written without a key keep
working after a key is added (they are re-encrypted when changed); values
written with a key cannot be read if the key is removed or changed.

## API

| Endpoint | Permission |
| --- | --- |
| `GET /api/v1/auth/status`, `POST /auth/setup`, `/auth/login`, `/auth/login/verify`, `/auth/logout` | public |
| `GET /auth/me`, `POST /auth/password`, `/auth/totp/setup`, `/auth/totp/enable`, `/auth/totp/disable` | signed in |
| `GET /users`, `GET /users/{id}` | users:read |
| `POST /users`, `PUT /users/{id}`, `POST /users/{id}/reset-totp`, `POST /users/{id}/unlock` | users:edit |
| `DELETE /users/{id}` | users:delete |
| `GET /roles` | roles:read or users:read |
| `POST /roles`, `PUT /roles/{id}` / `DELETE /roles/{id}` | roles:edit / roles:delete |
| `GET /radius-servers` | radius:read |
| `POST`, `PUT /{id}`, `PATCH /{id}/activation`, `POST /{id}/test` | radius:edit |
| `DELETE /radius-servers/{id}` | radius:delete |

Unauthenticated requests get 401, missing permissions 403 with the section
and action in the message.
