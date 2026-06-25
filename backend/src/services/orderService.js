/**
 * Order Service — totals, fraud detection, promotions, driver dispatch
 */
const { supabase } = require('../config/supabase');
const { calculateDistance } = require('./locationService');

const detectFraud = async (customerId, vendorId, total) => {
  const flags = [];
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: recentOrders } = await supabase
    .from('orders')
    .select('id')
    .eq('customer_id', customerId)
    .eq('vendor_id', vendorId)
    .gte('created_at', fiveMinAgo);

  if (recentOrders?.length > 0) flags.push('duplicate_order_within_5min');

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: hourlyOrders } = await supabase
    .from('orders')
    .select('id')
    .eq('customer_id', customerId)
    .gte('created_at', oneHourAgo);

  if (hourlyOrders?.length >= 5) flags.push('excessive_orders_per_hour');
  if (total > 2000) flags.push('high_value_order');

  return { isSuspicious: flags.length > 0, flags };
};

const applyPromotionDiscount = async (subtotal, promotionId, vendorId) => {
  if (!promotionId) return { subtotal, discount: 0 };

  const { data: promo } = await supabase
    .from('promotions')
    .select('*')
    .eq('id', promotionId)
    .eq('vendor_id', vendorId)
    .eq('is_active', true)
    .single();

  if (!promo) return { subtotal, discount: 0 };

  const now = new Date();
  if (promo.starts_at && new Date(promo.starts_at) > now) return { subtotal, discount: 0 };
  if (promo.ends_at && new Date(promo.ends_at) < now) return { subtotal, discount: 0 };

  let discount = 0;
  if (promo.type === 'percentage') {
    discount = (subtotal * parseFloat(promo.discount_value)) / 100;
  } else if (promo.type === 'fixed_amount') {
    discount = parseFloat(promo.discount_value);
  } else if (promo.type === 'bogo') {
    discount = subtotal * 0.5;
  } else if (promo.type === 'happy_hour') {
    discount = (subtotal * parseFloat(promo.discount_value || 10)) / 100;
  }

  discount = Math.min(discount, subtotal);
  return {
    subtotal: Math.round((subtotal - discount) * 100) / 100,
    discount: Math.round(discount * 100) / 100,
  };
};

/**
 * Calculate order total using CANONICAL prices from the database.
 * Client-supplied prices are NEVER trusted.
 */
const calculateOrderTotal = async (items, deliveryFee = 15, promotionId = null, vendorId = null) => {
  const ids = items.map((i) => i.menu_item_id || i.id).filter(Boolean);
  if (!ids.length) throw new Error('No valid menu item IDs provided');

  const { data: menuItems, error } = await supabase
    .from('menu_items')
    .select('id, price, is_available')
    .in('id', ids);

  if (error) throw new Error('Failed to fetch menu item prices');
  if (!menuItems || menuItems.length !== ids.length) {
    throw new Error('One or more menu items not found or unavailable');
  }

  const unavailable = menuItems.filter((m) => m.is_available === false);
  if (unavailable.length > 0) {
    throw new Error(`Some items are no longer available: ${unavailable.map((m) => m.id).join(', ')}`);
  }

  const priceMap = Object.fromEntries(menuItems.map((m) => [m.id, parseFloat(m.price)]));

  const rawSubtotal = items.reduce((sum, item) => {
    const id = item.menu_item_id || item.id;
    const price = priceMap[id];
    if (price == null) throw new Error(`Price not found for item ${id}`);
    return sum + price * (item.quantity || 1);
  }, 0);

  const { subtotal, discount } = await applyPromotionDiscount(rawSubtotal, promotionId, vendorId);
  const total = subtotal + deliveryFee;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    deliveryFee,
    total: Math.round(total * 100) / 100,
    discount: discount || 0,
    priceMap, // return for order_items insertion so routes can use canonical prices
  };
};

/**
 * Find the nearest available online driver within radiusKm of a location.
 * @param {number} vendorLat
 * @param {number} vendorLng
 * @param {number} radiusKm
 * @param {string[]} excludeIds - driver IDs to skip (already offered, rejected, etc.)
 * @returns {object|null} nearest driver record or null if none found
 */
const findNearestDriver = async (vendorLat, vendorLng, radiusKm = 10, excludeIds = []) => {
  const { data: drivers, error } = await supabase
    .from('driver_locations')
    .select('driver_id, latitude, longitude')
    .eq('is_online', true);

  if (error) {
    console.error('[findNearestDriver] DB error:', error.message);
    return null;
  }
  if (!drivers?.length) return null;

  // Filter out excluded drivers
  const available = excludeIds.length
    ? drivers.filter((d) => !excludeIds.includes(d.driver_id))
    : drivers;

  if (!available.length) return null;

  const candidates = available
    .map((d) => ({
      ...d,
      distKm: calculateDistance(vendorLat, vendorLng, d.latitude, d.longitude),
    }))
    .filter((d) => d.distKm <= radiusKm)
    .sort((a, b) => a.distKm - b.distKm);

  return candidates[0] || null;
};

module.exports = {
  detectFraud,
  calculateOrderTotal,
  applyPromotionDiscount,
  findNearestDriver,
};
