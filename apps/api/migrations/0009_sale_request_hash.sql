-- Fingerprint of the request that created a sale under an Idempotency-Key.
--
-- A retry must repeat the original request. Reusing a key for a different order
-- (other lines, payment method or occurredAt) is a client bug; without this column
-- the API would answer with the old sale and the new order would be silently lost.
-- SHA-256 of the normalised request, so the comparison is exact and cheap.
-- Nullable: sales without a key have nothing to compare, and sales recorded before
-- this migration replay without a check.
ALTER TABLE sales.sales ADD COLUMN request_hash bytea;
