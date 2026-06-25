-- ============================================================
-- Kasi Eats — Driver App Migration 001
-- Run in Supabase SQL Editor
-- ============================================================

-- Offer status enum
DO $$ BEGIN
  CREATE TYPE offer_status AS ENUM ('pending', 'accepted', 'rejected', 'expired', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Earnings type enum
DO $$ BEGIN
  CREATE TYPE earning_type AS ENUM ('delivery_fee', 'tip', 'bonus');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ─── DRIVER PROFILES ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  wallet_balance DECIMAL(10,2) DEFAULT 0,
  rating DECIMAL(2,1) DEFAULT 5.0,
  total_deliveries INTEGER DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  vehicle_type VARCHAR(50) DEFAULT 'motorcycle',
  expo_push_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_profiles_user ON driver_profiles(user_id);

-- ─── DRIVER EARNINGS LEDGER ───────────────────────────────
CREATE TABLE IF NOT EXISTS driver_earnings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  type earning_type DEFAULT 'delivery_fee',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_earnings_driver ON driver_earnings(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_earnings_order ON driver_earnings(order_id);

-- ─── DELIVERY OFFERS (dispatch queue) ─────────────────────
CREATE TABLE IF NOT EXISTS delivery_offers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  driver_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  status offer_status DEFAULT 'pending',
  payout_amount DECIMAL(10,2) NOT NULL,
  distance_km DECIMAL(8,2),
  vendor_lat DOUBLE PRECISION,
  vendor_lng DOUBLE PRECISION,
  delivery_lat DOUBLE PRECISION,
  delivery_lng DOUBLE PRECISION,
  expires_at TIMESTAMPTZ NOT NULL,
  attempt_number INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_offers_order ON delivery_offers(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_offers_driver ON delivery_offers(driver_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_offer_per_order
  ON delivery_offers(order_id) WHERE status = 'pending';

-- ─── ORDERS: driver payout column ─────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_payout DECIMAL(10,2);

-- ─── DRIVER LOCATIONS: spoofing detection fields ──────────
ALTER TABLE driver_locations ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ;
ALTER TABLE driver_locations ADD COLUMN IF NOT EXISTS last_latitude DOUBLE PRECISION;
ALTER TABLE driver_locations ADD COLUMN IF NOT EXISTS last_longitude DOUBLE PRECISION;

-- Triggers
CREATE TRIGGER update_driver_profiles_updated_at
  BEFORE UPDATE ON driver_profiles FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_delivery_offers_updated_at
  BEFORE UPDATE ON delivery_offers FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
