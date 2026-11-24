CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    builtin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    section VARCHAR(32) NOT NULL,
    full_access BOOLEAN NOT NULL DEFAULT FALSE,
    can_read BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete BOOLEAN NOT NULL DEFAULT FALSE,
    can_import BOOLEAN NOT NULL DEFAULT FALSE,
    can_export BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY(role_id, section)
);

INSERT INTO roles (name, description, builtin)
VALUES ('Administrator', 'Full access to every section of the application.', TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, section, full_access, can_read, can_edit, can_delete, can_import, can_export)
SELECT r.id, s.section, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE
FROM roles r
CROSS JOIN (VALUES ('dashboard'), ('epg'), ('channels'), ('sources'), ('outputs'), ('multicast'), ('users'), ('roles'), ('radius')) AS s(section)
WHERE r.name = 'Administrator' AND r.builtin
ON CONFLICT (role_id, section) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    display_name VARCHAR(200) NOT NULL DEFAULT '',
    email VARCHAR(254) NOT NULL DEFAULT '',
    auth_type VARCHAR(16) NOT NULL DEFAULT 'local' CHECK (auth_type IN ('local', 'remote')),
    password_hash TEXT NOT NULL DEFAULT '',
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    totp_required BOOLEAN NOT NULL DEFAULT FALSE,
    totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    totp_secret TEXT NOT NULL DEFAULT '',
    totp_last_step BIGINT NOT NULL DEFAULT 0,
    failed_logins INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    password_changed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key ON users (lower(username));

CREATE TABLE IF NOT EXISTS user_sessions (
    token_hash CHAR(64) PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_token CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    remote_addr VARCHAR(64) NOT NULL DEFAULT '',
    user_agent VARCHAR(300) NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS radius_servers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL UNIQUE,
    host VARCHAR(255) NOT NULL,
    port INT NOT NULL DEFAULT 1812,
    secret TEXT NOT NULL,
    timeout_seconds INT NOT NULL DEFAULT 5,
    retries INT NOT NULL DEFAULT 1,
    nas_identifier VARCHAR(100) NOT NULL DEFAULT 'xmltv-epg',
    priority INT NOT NULL DEFAULT 10,
    require_message_authenticator BOOLEAN NOT NULL DEFAULT TRUE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
