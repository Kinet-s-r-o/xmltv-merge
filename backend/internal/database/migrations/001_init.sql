-- 001_init.sql
-- Initial schema for XMLTV EPG Aggregator

CREATE TABLE IF NOT EXISTS sources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) UNIQUE NOT NULL,
    generator_info_name VARCHAR(500),
    generator_info_url TEXT,
    last_import_at TIMESTAMPTZ,
    last_import_status VARCHAR(20),
    last_import_error TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channels (
    id SERIAL PRIMARY KEY,
    source_id INT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    external_id VARCHAR(200) NOT NULL,
    name VARCHAR(500) NOT NULL,
    name_lang VARCHAR(5),
    icon_url TEXT,
    url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(source_id, external_id)
);

CREATE TABLE IF NOT EXISTS programmes (
    id BIGSERIAL PRIMARY KEY,
    source_id INT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    channel_id INT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    stop_time TIMESTAMPTZ NOT NULL,
    subtitle TEXT,
    subtitle_lang VARCHAR(5),
    description TEXT,
    description_lang VARCHAR(5),
    country VARCHAR(10),
    year SMALLINT,
    episode_num VARCHAR(20),
    episode_num_system VARCHAR(50),
    icon_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(source_id, channel_id, start_time)
);

CREATE TABLE IF NOT EXISTS programme_titles (
    id BIGSERIAL PRIMARY KEY,
    programme_id BIGINT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
    lang VARCHAR(5) NOT NULL,
    title VARCHAR(500) NOT NULL,
    UNIQUE(programme_id, lang)
);

CREATE TABLE IF NOT EXISTS programme_credits (
    id BIGSERIAL PRIMARY KEY,
    programme_id BIGINT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,
    name VARCHAR(200) NOT NULL
);

CREATE TABLE IF NOT EXISTS programme_categories (
    id BIGSERIAL PRIMARY KEY,
    programme_id BIGINT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
    lang VARCHAR(5),
    category VARCHAR(100) NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_programmes_channel_start ON programmes(channel_id, start_time);
CREATE INDEX IF NOT EXISTS idx_programmes_start_stop ON programmes(start_time, stop_time);
CREATE INDEX IF NOT EXISTS idx_programmes_source ON programmes(source_id);
CREATE INDEX IF NOT EXISTS idx_channels_source ON channels(source_id);
CREATE INDEX IF NOT EXISTS idx_titles_programme ON programme_titles(programme_id);
CREATE INDEX IF NOT EXISTS idx_credits_programme ON programme_credits(programme_id);
CREATE INDEX IF NOT EXISTS idx_categories_programme ON programme_categories(programme_id);
