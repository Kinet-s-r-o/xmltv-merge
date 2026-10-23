CREATE UNIQUE INDEX IF NOT EXISTS channels_source_id_external_id_key
    ON channels (source_id, external_id);

CREATE UNIQUE INDEX IF NOT EXISTS programmes_source_id_channel_id_start_time_key
    ON programmes (source_id, channel_id, start_time);
