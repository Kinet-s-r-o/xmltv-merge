CREATE TABLE IF NOT EXISTS outputs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL UNIQUE,
    slug VARCHAR(220) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS output_channels (
    id SERIAL PRIMARY KEY,
    output_id INT NOT NULL REFERENCES outputs(id) ON DELETE CASCADE,
    channel_id INT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    display_name VARCHAR(500) NOT NULL DEFAULT '',
    include_title BOOLEAN NOT NULL DEFAULT TRUE,
    include_subtitle BOOLEAN NOT NULL DEFAULT TRUE,
    include_description BOOLEAN NOT NULL DEFAULT TRUE,
    include_credits BOOLEAN NOT NULL DEFAULT TRUE,
    include_categories BOOLEAN NOT NULL DEFAULT TRUE,
    include_country BOOLEAN NOT NULL DEFAULT TRUE,
    include_year BOOLEAN NOT NULL DEFAULT TRUE,
    include_episode_num BOOLEAN NOT NULL DEFAULT TRUE,
    include_icon BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE(output_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_output_channels_output ON output_channels(output_id);
