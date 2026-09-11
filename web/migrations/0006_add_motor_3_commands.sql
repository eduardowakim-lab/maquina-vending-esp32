CREATE TABLE device_commands_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  motor INTEGER NOT NULL CHECK (motor IN (1, 2, 3)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'completed', 'expired')),
  created_at INTEGER NOT NULL,
  claimed_at INTEGER,
  completed_at INTEGER,
  FOREIGN KEY (device_id) REFERENCES devices(device_id)
);

INSERT INTO device_commands_new (
  id, device_id, motor, status, created_at, claimed_at, completed_at
)
SELECT
  id, device_id, motor, status, created_at, claimed_at, completed_at
FROM device_commands;

DROP TABLE device_commands;
ALTER TABLE device_commands_new RENAME TO device_commands;

CREATE INDEX IF NOT EXISTS idx_device_commands_next
ON device_commands(device_id, status, created_at);
