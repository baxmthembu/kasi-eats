-- Prevents double-crediting a driver for the same delivery under concurrent
-- "delivered" status updates or retried requests. earningsService's existing
-- select-then-insert idempotency check is not atomic on its own; this
-- constraint makes the guarantee real at the database level.
CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_earnings_order_driver
  ON driver_earnings(order_id, driver_id)
  WHERE order_id IS NOT NULL;
