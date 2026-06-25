/**
 * Enrich order payloads for WebSocket and API responses
 */
const { supabase } = require('../config/supabase');

const enrichOrder = async (order) => {
  if (!order) return null;

  const enriched = { ...order };

  if (order.customer_id) {
    const { data: customer } = await supabase
      .from('users')
      .select('id, name, phone')
      .eq('id', order.customer_id)
      .single();
    enriched.customer = customer || null;
  }

  if (order.driver_id) {
    const { data: driver } = await supabase
      .from('users')
      .select('id, name, phone, avatar_url')
      .eq('id', order.driver_id)
      .single();
    const { data: loc } = await supabase
      .from('driver_locations')
      .select('latitude, longitude, heading, speed, updated_at')
      .eq('driver_id', order.driver_id)
      .maybeSingle();
    enriched.driver = driver ? { ...driver, location: loc } : null;
  }

  const { data: payment } = await supabase
    .from('payments')
    .select('status, amount, vendor_payout, paid_at')
    .eq('order_id', order.id)
    .maybeSingle();
  enriched.payment = payment || null;

  return enriched;
};

module.exports = { enrichOrder };
