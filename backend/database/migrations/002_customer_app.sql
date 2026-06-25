-- ============================================================
-- Kasi Eats — Customer App Migration 002
-- Run in Supabase SQL Editor
-- ============================================================

-- Saved delivery addresses
CREATE TABLE IF NOT EXISTS saved_addresses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  label VARCHAR(50) DEFAULT 'Home',
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_addresses_user ON saved_addresses(user_id);

-- Favorite vendors
CREATE TABLE IF NOT EXISTS favorite_vendors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_favorite_vendors_user ON favorite_vendors(user_id);

-- Favorite menu items
CREATE TABLE IF NOT EXISTS favorite_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, menu_item_id)
);

CREATE INDEX IF NOT EXISTS idx_favorite_items_user ON favorite_items(user_id);

-- Track if customer reviewed driver for an order (prevent duplicates)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_reviewed BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vendor_reviewed BOOLEAN DEFAULT false;

-- Unique review per order per target type
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_one_per_order_target
  ON reviews(order_id, target_type, reviewer_id);
