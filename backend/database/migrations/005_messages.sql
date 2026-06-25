-- Migration 005: Chat messages for customer-driver communication
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  sender_role TEXT NOT NULL CHECK (sender_role IN ('customer', 'driver')),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'call_request', 'call_ended')),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast lookup by order + time (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_messages_order_id_created ON messages(order_id, created_at DESC);

-- Mark read query optimization
CREATE INDEX IF NOT EXISTS idx_messages_sender_read ON messages(order_id, sender_id, is_read);
