-- Migration 004: Add missing columns to orders table
-- Run this in the Supabase SQL Editor

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tip_amount        DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_number      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cancel_reason     TEXT,
  ADD COLUMN IF NOT EXISTS refund_needed     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS driver_reviewed   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS vendor_reviewed   BOOLEAN DEFAULT false;

-- order_tips table for tip tracking
CREATE TABLE IF NOT EXISTS order_tips (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id    UUID REFERENCES orders(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES users(id),
  amount      DECIMAL(10,2) NOT NULL,
  status      VARCHAR(20) DEFAULT 'pending',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_tips_order ON order_tips(order_id);

-- Add delivery_fee column to vendors if missing
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS delivery_fee          DECIMAL(10,2) DEFAULT 15.00,
  ADD COLUMN IF NOT EXISTS estimated_delivery_time INTEGER DEFAULT 30;
