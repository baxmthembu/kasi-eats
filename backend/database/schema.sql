-- ============================================================
-- Kasi Eats — PostgreSQL Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable PostGIS for geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- ─── ENUMS ─────────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('customer', 'driver', 'vendor');
CREATE TYPE order_status AS ENUM (
  'pending', 'confirmed', 'preparing', 'ready_for_pickup',
  'picked_up', 'on_the_way', 'delivered', 'cancelled'
);
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
CREATE TYPE review_target AS ENUM ('vendor', 'driver');

-- ─── USERS TABLE ───────────────────────────────────────────
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  role user_role NOT NULL DEFAULT 'customer',
  avatar_url TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  address TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ─── VENDORS TABLE ─────────────────────────────────────────
CREATE TABLE vendors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  business_name VARCHAR(255) NOT NULL,
  description TEXT,
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  rating DECIMAL(2,1) DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  is_open BOOLEAN DEFAULT false,
  cover_image TEXT,
  phone VARCHAR(20),
  delivery_radius_km DECIMAL(5,2) DEFAULT 5.00,
  min_order_amount DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vendors_user ON vendors(user_id);
CREATE INDEX idx_vendors_location ON vendors(latitude, longitude);
CREATE INDEX idx_vendors_open ON vendors(is_open);

-- ─── MENU ITEMS TABLE ──────────────────────────────────────
CREATE TABLE menu_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  image_url TEXT,
  category VARCHAR(100),
  is_available BOOLEAN DEFAULT true,
  preparation_time INTEGER DEFAULT 15, -- minutes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_menu_vendor ON menu_items(vendor_id);
CREATE INDEX idx_menu_available ON menu_items(vendor_id, is_available);

-- ─── ORDERS TABLE ──────────────────────────────────────────
CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES users(id),
  vendor_id UUID REFERENCES vendors(id),
  driver_id UUID REFERENCES users(id),
  subtotal DECIMAL(10,2) NOT NULL,
  delivery_fee DECIMAL(10,2) DEFAULT 15.00,
  total DECIMAL(10,2) NOT NULL,
  status order_status DEFAULT 'pending',
  delivery_address TEXT NOT NULL,
  delivery_latitude DOUBLE PRECISION,
  delivery_longitude DOUBLE PRECISION,
  special_instructions TEXT,
  estimated_delivery_time INTEGER, -- minutes
  driver_payout DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_vendor ON orders(vendor_id);
CREATE INDEX idx_orders_driver ON orders(driver_id);
CREATE INDEX idx_orders_status ON orders(status);

-- ─── ORDER ITEMS TABLE ─────────────────────────────────────
CREATE TABLE order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES menu_items(id),
  name VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  price DECIMAL(10,2) NOT NULL,
  notes TEXT
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ─── PAYMENTS TABLE ────────────────────────────────────────
CREATE TABLE payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  method VARCHAR(50) DEFAULT 'payfast',
  status payment_status DEFAULT 'pending',
  payfast_payment_id VARCHAR(255),
  commission DECIMAL(10,2) DEFAULT 0,
  vendor_payout DECIMAL(10,2) DEFAULT 0,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);

-- ─── REVIEWS TABLE ─────────────────────────────────────────
CREATE TABLE reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  reviewer_id UUID REFERENCES users(id),
  target_id UUID NOT NULL, -- vendor_id or driver user_id
  target_type review_target NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5) NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reviews_target ON reviews(target_id, target_type);
CREATE INDEX idx_reviews_reviewer ON reviews(reviewer_id);

-- ─── DRIVER LOCATIONS TABLE ────────────────────────────────
CREATE TABLE driver_locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  is_online BOOLEAN DEFAULT false,
  heading DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  last_location_at TIMESTAMPTZ,
  last_latitude DOUBLE PRECISION,
  last_longitude DOUBLE PRECISION,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_driver_loc_online ON driver_locations(is_online);
CREATE INDEX idx_driver_loc_coords ON driver_locations(latitude, longitude);

-- ─── DRIVER PROFILES ───────────────────────────────────────
CREATE TYPE offer_status AS ENUM ('pending', 'accepted', 'rejected', 'expired', 'cancelled');
CREATE TYPE earning_type AS ENUM ('delivery_fee', 'tip', 'bonus');

CREATE TABLE driver_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  wallet_balance DECIMAL(10,2) DEFAULT 0,
  rating DECIMAL(2,1) DEFAULT 5.0,
  total_deliveries INTEGER DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  vehicle_type VARCHAR(50) DEFAULT 'car',
  expo_push_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_driver_profiles_user ON driver_profiles(user_id);

CREATE TABLE driver_earnings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  type earning_type DEFAULT 'delivery_fee',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_driver_earnings_driver ON driver_earnings(driver_id, created_at DESC);

CREATE TABLE delivery_offers (
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

CREATE UNIQUE INDEX idx_one_pending_offer_per_order
  ON delivery_offers(order_id) WHERE status = 'pending';

-- ─── CUSTOMER: SAVED ADDRESSES & FAVORITES ────────────────
CREATE TABLE saved_addresses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  label VARCHAR(50) DEFAULT 'Home',
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_saved_addresses_user ON saved_addresses(user_id);

CREATE TABLE favorite_vendors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, vendor_id)
);

CREATE TABLE favorite_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, menu_item_id)
);

-- ─── NOTIFICATIONS TABLE ──────────────────────────────────
CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50), -- order_update, new_order, delivery_update
  data JSONB,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);

-- ─── UPDATED_AT TRIGGER FUNCTION ──────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vendors_updated_at
  BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_menu_items_updated_at
  BEFORE UPDATE ON menu_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_driver_locations_updated_at
  BEFORE UPDATE ON driver_locations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── ADDITIONAL COLUMNS ────────────────────────────────────
-- Tracks when a PayFast ITN confirmed payment (used in payments.js ITN handler)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ;

-- ─── DRIVER BANK DETAILS ─────────────────────────────────────
-- Stored on driver_profiles so admin can initiate weekly EFT payouts.
ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS bank_name               VARCHAR(100);
ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS account_holder          VARCHAR(255);
ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS account_number          VARCHAR(50);
ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS branch_code             VARCHAR(20);
ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS account_type            VARCHAR(20) DEFAULT 'savings';
ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS bank_details_updated_at TIMESTAMPTZ;

-- ─── PAYOUT SYSTEM SCHEMA ─────────────────────────────────────────────────

-- Admin role (for payout approval dashboard)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';

-- Tips column on orders (customer pre-delivery tip, included in PayFast total)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tip_amount DECIMAL(10,2) DEFAULT 0;

-- Expand driver_earnings with full earnings breakdown
-- (original table only had: id, driver_id, order_id, amount, type, created_at)
ALTER TABLE driver_earnings ADD COLUMN IF NOT EXISTS delivery_fee_amount  DECIMAL(10,2) DEFAULT 0;
ALTER TABLE driver_earnings ADD COLUMN IF NOT EXISTS distance_km          DECIMAL(8,2)  DEFAULT 0;
ALTER TABLE driver_earnings ADD COLUMN IF NOT EXISTS distance_fee         DECIMAL(10,2) DEFAULT 0;
ALTER TABLE driver_earnings ADD COLUMN IF NOT EXISTS tip_amount           DECIMAL(10,2) DEFAULT 0;
ALTER TABLE driver_earnings ADD COLUMN IF NOT EXISTS bonus_amount         DECIMAL(10,2) DEFAULT 0;
ALTER TABLE driver_earnings ADD COLUMN IF NOT EXISTS platform_commission  DECIMAL(10,2) DEFAULT 0;
ALTER TABLE driver_earnings ADD COLUMN IF NOT EXISTS net_payout           DECIMAL(10,2) DEFAULT 0;
ALTER TABLE driver_earnings ADD COLUMN IF NOT EXISTS status               VARCHAR(20)   DEFAULT 'pending';
ALTER TABLE driver_earnings ADD COLUMN IF NOT EXISTS payout_id            UUID;

-- Driver wallet — single source of truth for balances
CREATE TABLE IF NOT EXISTS driver_wallets (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id         UUID        REFERENCES users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  available_balance DECIMAL(10,2) DEFAULT 0,   -- ready to be paid out (week processed)
  pending_balance   DECIMAL(10,2) DEFAULT 0,   -- earned but not yet in a payout cycle
  lifetime_earnings DECIMAL(10,2) DEFAULT 0,
  total_tips        DECIMAL(10,2) DEFAULT 0,
  total_bonuses     DECIMAL(10,2) DEFAULT 0,
  total_deliveries  INTEGER       DEFAULT 0,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_driver_wallets_driver ON driver_wallets(driver_id);

-- Weekly payout records — one per driver per week
CREATE TABLE IF NOT EXISTS driver_payouts (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id           UUID        REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  week_start          DATE        NOT NULL,
  week_end            DATE        NOT NULL,
  total_amount        DECIMAL(10,2) NOT NULL,
  delivery_fee_total  DECIMAL(10,2) DEFAULT 0,
  distance_fee_total  DECIMAL(10,2) DEFAULT 0,
  tips_total          DECIMAL(10,2) DEFAULT 0,
  bonuses_total       DECIMAL(10,2) DEFAULT 0,
  commission_total    DECIMAL(10,2) DEFAULT 0,
  delivery_count      INTEGER       DEFAULT 0,
  status              VARCHAR(20)   DEFAULT 'pending',  -- pending|approved|processing|paid|rejected
  -- Bank detail snapshot at payout time (in case driver changes details later)
  bank_name           VARCHAR(100),
  account_holder      VARCHAR(255),
  account_number      VARCHAR(50),
  branch_code         VARCHAR(20),
  account_type        VARCHAR(20),
  admin_notes         TEXT,
  processed_at        TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(driver_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_driver_payouts_driver   ON driver_payouts(driver_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_driver_payouts_status   ON driver_payouts(status, created_at DESC);

-- Bonus records — one per bonus event
CREATE TABLE IF NOT EXISTS driver_bonuses (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id  UUID        REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  order_id   UUID        REFERENCES orders(id) ON DELETE SET NULL,
  bonus_type VARCHAR(50) NOT NULL,   -- peak_hour|weekend|rain|streak_5|streak_10|high_demand
  amount     DECIMAL(10,2) NOT NULL,
  reason     TEXT,
  status     VARCHAR(20) DEFAULT 'credited',  -- pending|credited
  earned_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_driver_bonuses_driver ON driver_bonuses(driver_id, earned_at DESC);

-- Customer tips — stored separately from order total for driver payout tracking
CREATE TABLE IF NOT EXISTS order_tips (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id    UUID        REFERENCES orders(id) ON DELETE CASCADE UNIQUE NOT NULL,
  customer_id UUID        REFERENCES users(id) NOT NULL,
  driver_id   UUID        REFERENCES users(id),
  amount      DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
  status      VARCHAR(20) DEFAULT 'pending',   -- pending|credited
  tipped_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_tips_order  ON order_tips(order_id);
CREATE INDEX IF NOT EXISTS idx_order_tips_driver ON order_tips(driver_id);

-- ─── COMPOUND INDEXES (performance) ───────────────────────
-- Speeds up order list queries sorted by recency for a given status
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);

-- Speeds up delivery offer lookups per driver
CREATE INDEX IF NOT EXISTS idx_delivery_offers_driver_status ON delivery_offers(driver_id, status);

-- Speeds up nearest-driver queries
CREATE INDEX IF NOT EXISTS idx_driver_locations_online_updated ON driver_locations(is_online, updated_at DESC);

-- Speeds up earnings queries by driver + status
CREATE INDEX IF NOT EXISTS idx_driver_earnings_driver_status  ON driver_earnings(driver_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_earnings_payout         ON driver_earnings(payout_id);

-- ─── VENDOR BANK DETAILS ──────────────────────────────────────────────────
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS bank_name               VARCHAR(100);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS account_holder          VARCHAR(255);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS account_number          VARCHAR(50);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS branch_code             VARCHAR(20);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS account_type            VARCHAR(20) DEFAULT 'savings';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS bank_details_updated_at TIMESTAMPTZ;

-- ─── VENDOR WALLET ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_wallets (
  id                UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id         UUID          REFERENCES vendors(id) ON DELETE CASCADE UNIQUE NOT NULL,
  available_balance DECIMAL(10,2) DEFAULT 0,   -- approved payout, being processed
  pending_balance   DECIMAL(10,2) DEFAULT 0,   -- earned but not yet in a payout cycle
  lifetime_earnings DECIMAL(10,2) DEFAULT 0,
  total_orders      INTEGER       DEFAULT 0,
  updated_at        TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vendor_wallets_vendor ON vendor_wallets(vendor_id);

-- ─── VENDOR WEEKLY PAYOUTS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_payouts (
  id             UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id      UUID          REFERENCES vendors(id) ON DELETE CASCADE NOT NULL,
  week_start     DATE          NOT NULL,
  week_end       DATE          NOT NULL,
  total_amount   DECIMAL(10,2) NOT NULL,
  order_count    INTEGER       DEFAULT 0,
  status         VARCHAR(20)   DEFAULT 'pending', -- pending|approved|processing|paid|rejected
  -- Bank detail snapshot at payout time (in case vendor changes details later)
  bank_name      VARCHAR(100),
  account_holder VARCHAR(255),
  account_number VARCHAR(50),
  branch_code    VARCHAR(20),
  account_type   VARCHAR(20),
  admin_notes    TEXT,
  paid_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ   DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE(vendor_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_vendor_payouts_vendor ON vendor_payouts(vendor_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_vendor_payouts_status ON vendor_payouts(status, created_at DESC);

