CREATE TABLE products_new (
  id INTEGER PRIMARY KEY CHECK (id IN (1, 2, 3)),
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents BETWEEN 1 AND 1000000),
  payment_url TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  image_key TEXT NOT NULL DEFAULT ''
);

INSERT INTO products_new (id, name, price_cents, payment_url, enabled, updated_at, image_key)
SELECT id, name, price_cents, payment_url, enabled, updated_at, image_key
FROM products;

DROP TABLE products;
ALTER TABLE products_new RENAME TO products;

INSERT OR IGNORE INTO products (id, name, price_cents, payment_url, enabled, image_key)
VALUES (3, 'Produto 3', 500, '', 1, '');
