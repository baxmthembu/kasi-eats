-- ============================================================
-- Kasi Eats — Vendor App Migration (003)
-- Run after schema.sql, 001_driver_app.sql, 002_customer_app.sql
-- ============================================================

CREATE TYPE promotion_type AS ENUM ('percentage', 'bogo', 'fixed_amount', 'happy_hour');
CREATE TYPE schedule_entity_type AS ENUM ('menu_item', 'promotion', 'combo');

-- ─── VENDORS EXTENSIONS ────────────────────────────────────
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS expo_push_token TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT '{}';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS category_tags TEXT[] DEFAULT '{}';

-- ─── ORDERS EXTENSIONS ───────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_needed BOOLEAN DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number) WHERE order_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_vendor_status_created ON orders(vendor_id, status, created_at DESC);

-- ─── REVIEWS EXTENSIONS ──────────────────────────────────────
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS vendor_response TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS vendor_responded_at TIMESTAMPTZ;

-- ─── MENU CATEGORIES ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(100) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_categories_vendor ON menu_categories(vendor_id);

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES menu_categories(id) ON DELETE SET NULL;

-- ─── PROMOTIONS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promotions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type promotion_type NOT NULL DEFAULT 'percentage',
  discount_value DECIMAL(10,2) NOT NULL DEFAULT 0,
  menu_item_ids UUID[] DEFAULT '{}',
  banner_url TEXT,
  is_active BOOLEAN DEFAULT true,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotions_vendor ON promotions(vendor_id, is_active);

-- ─── COMBO MEALS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS combo_meals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  image_url TEXT,
  is_available BOOLEAN DEFAULT true,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_combo_meals_vendor ON combo_meals(vendor_id);

CREATE TABLE IF NOT EXISTS combo_meal_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  combo_id UUID REFERENCES combo_meals(id) ON DELETE CASCADE NOT NULL,
  menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  UNIQUE(combo_id, menu_item_id)
);

-- ─── INVENTORY ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_item_inventory (
  menu_item_id UUID PRIMARY KEY REFERENCES menu_items(id) ON DELETE CASCADE,
  stock_qty INTEGER DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 5,
  track_inventory BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── AVAILABILITY SCHEDULES ──────────────────────────────────
CREATE TABLE IF NOT EXISTS availability_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE NOT NULL,
  entity_type schedule_entity_type NOT NULL,
  entity_id UUID NOT NULL,
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME,
  end_time TIME,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_availability_entity ON availability_schedules(entity_type, entity_id);

-- ─── VENDOR ANALYTICS DAILY ────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_analytics_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  orders_count INTEGER DEFAULT 0,
  revenue DECIMAL(12,2) DEFAULT 0,
  avg_rating DECIMAL(2,1),
  UNIQUE(vendor_id, date)
);

CREATE INDEX IF NOT EXISTS idx_vendor_analytics_vendor_date ON vendor_analytics_daily(vendor_id, date DESC);
