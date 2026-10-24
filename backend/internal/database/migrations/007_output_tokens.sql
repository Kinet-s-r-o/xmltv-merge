ALTER TABLE outputs ADD COLUMN IF NOT EXISTS public_token VARCHAR(64) NOT NULL DEFAULT '';

UPDATE outputs
SET public_token = md5(id::text || random()::text || clock_timestamp()::text)
WHERE public_token = '';

CREATE UNIQUE INDEX IF NOT EXISTS outputs_public_token_key ON outputs(public_token);
