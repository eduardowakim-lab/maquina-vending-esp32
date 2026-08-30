CREATE TABLE IF NOT EXISTS payment_orders (
  id TEXT PRIMARY KEY,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents BETWEEN 1 AND 1000000),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'pending', 'approved', 'rejected', 'cancelled', 'refunded', 'charged_back', 'commanded', 'error')),
  preference_id TEXT NOT NULL DEFAULT '',
  init_point TEXT NOT NULL DEFAULT '',
  mp_payment_id TEXT NOT NULL DEFAULT '',
  device_id TEXT NOT NULL DEFAULT 'machine-1',
  device_command_id INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  paid_at INTEGER,
  command_created_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_mp_payment
ON payment_orders(mp_payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_orders_status
ON payment_orders(status, created_at);
