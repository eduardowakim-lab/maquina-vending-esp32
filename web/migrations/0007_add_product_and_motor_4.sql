-- Canonicaliza as duas tabelas alteradas pelas migracoes 0005/0006.
-- A copia preserva todos os produtos e comandos existentes.
CREATE TABLE products_v4 (
  id INTEGER PRIMARY KEY CHECK (id IN (1, 2, 3, 4)),
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents BETWEEN 1 AND 1000000),
  payment_url TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  image_key TEXT NOT NULL DEFAULT ''
);

INSERT INTO products_v4 (id, name, price_cents, payment_url, enabled, updated_at, image_key)
SELECT id, name, price_cents, payment_url, enabled, updated_at, image_key
FROM products;

DROP TABLE products;
ALTER TABLE products_v4 RENAME TO products;

INSERT OR IGNORE INTO products (id, name, price_cents, payment_url, enabled, image_key)
VALUES (4, 'Produto 4', 500, '', 1, '');

CREATE TABLE device_commands_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  motor INTEGER NOT NULL CHECK (motor IN (1, 2, 3, 4)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'completed', 'expired')),
  created_at INTEGER NOT NULL,
  claimed_at INTEGER,
  completed_at INTEGER,
  FOREIGN KEY (device_id) REFERENCES devices(device_id)
);

INSERT INTO device_commands_v4 (
  id, device_id, motor, status, created_at, claimed_at, completed_at
)
SELECT id, device_id, motor, status, created_at, claimed_at, completed_at
FROM device_commands;

DROP TABLE device_commands;
ALTER TABLE device_commands_v4 RENAME TO device_commands;

CREATE INDEX IF NOT EXISTS idx_device_commands_next
ON device_commands(device_id, status, created_at);
