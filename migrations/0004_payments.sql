PRAGMA foreign_keys = ON;

ALTER TABLE orders ADD COLUMN paid_at TEXT;

CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL UNIQUE,
  payment_key TEXT NOT NULL UNIQUE,
  method TEXT,
  status TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount >= 0),
  approved_at TEXT NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_payment_key ON payments(payment_key);
