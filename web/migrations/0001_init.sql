CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY CHECK (id IN (1, 2)),
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents BETWEEN 1 AND 1000000),
  payment_url TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO products (id, name, price_cents, payment_url, enabled)
VALUES
  (1, 'Produto 1', 500, '', 1),
  (2, 'Produto 2', 1000, '', 1);

CREATE TABLE IF NOT EXISTS admin_credentials (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires
ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  ip_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_started INTEGER NOT NULL
);
