CREATE TABLE IF NOT EXISTS multicast_outputs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    multicast_address VARCHAR(45) NOT NULL,
    multicast_port INT NOT NULL,
    pid INT NOT NULL DEFAULT 18,
    chunk_seconds INT NOT NULL DEFAULT 30,
    timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Bratislava',
    days_ahead INT NOT NULL DEFAULT 4,
    text_encoding VARCHAR(16) NOT NULL DEFAULT 'utf8',
    language_code VARCHAR(3) NOT NULL DEFAULT 'slk',
    table_mode VARCHAR(16) NOT NULL DEFAULT 'actual',
    home_transport_stream_id INT,
    include_tdt_tot BOOLEAN NOT NULL DEFAULT FALSE,
    ttl INT NOT NULL DEFAULT 16,
    interface VARCHAR(64) NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS multicast_output_services (
    id SERIAL PRIMARY KEY,
    output_id INT NOT NULL REFERENCES multicast_outputs(id) ON DELETE CASCADE,
    channel_id INT REFERENCES channels(id) ON DELETE SET NULL,
    source_name VARCHAR(200) NOT NULL DEFAULT '',
    external_id VARCHAR(200) NOT NULL DEFAULT '',
    display_name VARCHAR(500) NOT NULL DEFAULT '',
    frequency INT,
    transport_stream_id INT NOT NULL,
    original_network_id INT NOT NULL DEFAULT 1,
    service_id INT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    position INT NOT NULL DEFAULT 0,
    UNIQUE(output_id, original_network_id, transport_stream_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_multicast_services_output ON multicast_output_services(output_id);
CREATE INDEX IF NOT EXISTS idx_multicast_services_channel ON multicast_output_services(channel_id);

CREATE TABLE IF NOT EXISTS multicast_eit_versions (
    output_id INT NOT NULL REFERENCES multicast_outputs(id) ON DELETE CASCADE,
    table_id INT NOT NULL,
    original_network_id INT NOT NULL,
    transport_stream_id INT NOT NULL,
    service_id INT NOT NULL,
    version INT NOT NULL,
    content_hash BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(output_id, table_id, original_network_id, transport_stream_id, service_id)
);
