-- Audit log of XMLTV import attempts: one row per manual, scheduled or upload
-- import, with the stage reached, counts and the reasons data was not imported.
CREATE TABLE IF NOT EXISTS source_import_log (
    id BIGSERIAL PRIMARY KEY,
    -- Kept when the source is deleted; source_name preserves the label.
    source_id INT REFERENCES sources(id) ON DELETE SET NULL,
    source_name TEXT NOT NULL,
    trigger TEXT NOT NULL,              -- manual | scheduled | upload
    triggered_by TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL,               -- running | success | partial | error
    stage TEXT NOT NULL DEFAULT '',     -- last stage reached: download | parse | channels | programmes | done
    error TEXT NOT NULL DEFAULT '',
    bytes BIGINT NOT NULL DEFAULT 0,
    channels_total INT NOT NULL DEFAULT 0,
    channels_imported INT NOT NULL DEFAULT 0,
    programmes_total INT NOT NULL DEFAULT 0,
    programmes_imported INT NOT NULL DEFAULT 0,
    programmes_past INT NOT NULL DEFAULT 0,
    programmes_invalid INT NOT NULL DEFAULT 0,
    programmes_unknown_channel INT NOT NULL DEFAULT 0,
    programmes_failed INT NOT NULL DEFAULT 0,
    detail_errors INT NOT NULL DEFAULT 0,
    issue_count INT NOT NULL DEFAULT 0,
    issues JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_source_import_log_source_started
    ON source_import_log (source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_import_log_started
    ON source_import_log (started_at);
