ALTER TABLE devices ADD COLUMN wifi_ssid TEXT;

CREATE TABLE IF NOT EXISTS wifi_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  ssid TEXT NOT NULL,
  network_key TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed','completed','failed','expired')),
  result TEXT,
  created_at INTEGER NOT NULL,
  claimed_at INTEGER,
  completed_at INTEGER,
  FOREIGN KEY (device_id) REFERENCES devices(device_id)
);

CREATE INDEX IF NOT EXISTS idx_wifi_commands_next
ON wifi_commands(device_id, status, created_at);
