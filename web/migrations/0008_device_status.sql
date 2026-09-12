ALTER TABLE devices ADD COLUMN last_seen INTEGER;
ALTER TABLE devices ADD COLUMN firmware_version INTEGER;
ALTER TABLE devices ADD COLUMN transport TEXT NOT NULL DEFAULT 'http';
