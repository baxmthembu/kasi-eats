/**
 * Shared Application Constants
 */
const CONSTANTS = {
  API_URL: process.env.EXPO_PUBLIC_API_URL || 'https://api.kasieats.com/api',

  ROLES: {
    CUSTOMER: 'customer',
    DRIVER: 'driver',
    VENDOR: 'vendor',
  },

  ORDER_STATUS: {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    PREPARING: 'preparing',
    READY: 'ready_for_pickup',
    PICKED_UP: 'picked_up',
    ON_THE_WAY: 'on_the_way',
    DELIVERED: 'delivered',
    CANCELLED: 'cancelled',
  },

  DRIVER_STATUS: {
    OFFLINE: 'offline',
    ONLINE: 'online',
    ON_DELIVERY: 'on_delivery',
  },

  OFFER_TIMEOUT_SEC: 30,

  // Driver delivery action labels per order status
  DRIVER_ACTIONS: {
    confirmed: { label: 'Navigate to Pickup', nextStatus: null },
    ready_for_pickup: { label: 'Arrived at Vendor', nextStatus: null },
    picked_up: { label: 'Picked Up Order', nextStatus: 'picked_up' },
    on_the_way: { label: 'Mark Delivered', nextStatus: 'delivered' },
  },

  PROMO_TYPES: {
    PERCENTAGE: 'percentage',
    BOGO: 'bogo',
    FIXED: 'fixed_amount',
    HAPPY_HOUR: 'happy_hour',
  },

  VENDOR_ORDER_STATUS_LABELS: {
    pending: 'Awaiting payment',
    confirmed: 'New order — accept & prepare',
    preparing: 'Preparing',
    ready_for_pickup: 'Ready for pickup',
    picked_up: 'Driver picked up',
    on_the_way: 'Out for delivery',
    delivered: 'Completed',
    cancelled: 'Cancelled',
  },

  CUSTOMER_ORDER_STATUS_LABELS: {
    pending: 'Awaiting payment',
    confirmed: 'Payment successful — vendor preparing',
    preparing: 'Vendor is preparing your order',
    ready_for_pickup: 'Ready for driver pickup',
    picked_up: 'Driver picked up your order',
    on_the_way: 'Driver is on the way',
    delivered: 'Delivered successfully',
    cancelled: 'Order cancelled',
  },
};

module.exports = CONSTANTS;
