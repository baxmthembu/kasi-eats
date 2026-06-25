/**
 * Reviews Routes — vendor and driver ratings with duplicate prevention
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { supabase } = require('../config/supabase');
const { authenticate, authorize } = require('../middleware/auth');
const router = express.Router();

/**
 * Submit a review (one per order per target type)
 * POST /api/reviews
 */
router.post('/', authenticate, authorize('customer'), [
  body('order_id').isUUID(),
  body('target_id').notEmpty(),
  body('target_type').isIn(['vendor', 'driver']),
  body('rating').isInt({ min: 1, max: 5 }),
  body('comment').optional().isString().trim().isLength({ max: 1000 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { order_id, target_id, target_type, rating, comment } = req.body;
  const reviewer_id = req.user.id;

  try {
    const { data: order } = await supabase
      .from('orders')
      .select('customer_id, status, driver_id, driver_reviewed, vendor_reviewed, vendor_id')
      .eq('id', order_id)
      .single();

    if (!order || order.customer_id !== reviewer_id) {
      return res.status(403).json({ error: 'Only the customer can review this order' });
    }

    if (order.status !== 'delivered') {
      return res.status(400).json({ error: 'Order must be delivered before reviewing' });
    }

    if (target_type === 'driver' && order.driver_reviewed) {
      return res.status(400).json({ error: 'You already rated the driver for this order' });
    }
    if (target_type === 'vendor' && order.vendor_reviewed) {
      return res.status(400).json({ error: 'You already rated this vendor for this order' });
    }

    // Check existing review
    const { data: existing } = await supabase
      .from('reviews')
      .select('id')
      .eq('order_id', order_id)
      .eq('reviewer_id', reviewer_id)
      .eq('target_type', target_type)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: 'Review already submitted for this order' });
    }

    const { data: review, error } = await supabase
      .from('reviews')
      .insert({
        order_id,
        reviewer_id,
        target_id,
        target_type,
        rating,
        comment: comment || null,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Mark order as reviewed
    const reviewFlag =
      target_type === 'driver' ? { driver_reviewed: true } : { vendor_reviewed: true };
    await supabase.from('orders').update(reviewFlag).eq('id', order_id);

    // Update vendor aggregate rating using server-side aggregate (no full table scan)
    if (target_type === 'vendor') {
      const { data: agg } = await supabase
        .from('reviews')
        .select('rating.avg(), rating.count()')
        .eq('target_id', target_id)
        .eq('target_type', 'vendor')
        .single();

      if (agg) {
        await supabase
          .from('vendors')
          .update({
            rating: parseFloat(parseFloat(agg.avg || 0).toFixed(1)),
            total_reviews: parseInt(agg.count || 0, 10),
          })
          .eq('id', target_id);
      }
    }

    // Update driver aggregate rating using server-side aggregate
    if (target_type === 'driver') {
      const { data: agg } = await supabase
        .from('reviews')
        .select('rating.avg(), rating.count()')
        .eq('target_id', target_id)
        .eq('target_type', 'driver')
        .single();

      if (agg) {
        await supabase
          .from('driver_profiles')
          .update({
            rating: parseFloat(parseFloat(agg.avg || 0).toFixed(1)),
            total_reviews: parseInt(agg.count || 0, 10),
          })
          .eq('user_id', target_id);
      }
    }

    res.status(201).json({ review });
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

/**
 * Check if reviews exist for an order
 * GET /api/reviews/order/:orderId
 */
router.get('/order/:orderId', authenticate, async (req, res) => {
  const { data: reviews } = await supabase
    .from('reviews')
    .select('*')
    .eq('order_id', req.params.orderId)
    .eq('reviewer_id', req.user.id);

  const { data: order } = await supabase
    .from('orders')
    .select('driver_id, driver_reviewed, vendor_reviewed, vendor_id, status')
    .eq('id', req.params.orderId)
    .single();

  res.json({
    reviews: reviews || [],
    order,
    canReviewDriver:
      order?.status === 'delivered' && !order?.driver_reviewed && !!order?.driver_id,
  });
});

/**
 * Vendor: list reviews for my business
 */
router.get('/vendors/me', authenticate, authorize('vendor'), async (req, res) => {
  const { data: vendor } = await supabase
    .from('vendors')
    .select('id')
    .eq('user_id', req.user.id)
    .single();

  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

  const { data: reviews, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('target_id', vendor.id)
    .eq('target_type', 'vendor')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });

  const enriched = await Promise.all(
    (reviews || []).map(async (r) => {
      const { data: reviewer } = await supabase
        .from('users')
        .select('name')
        .eq('id', r.reviewer_id)
        .single();
      return { ...r, users: reviewer };
    })
  );

  res.json({ reviews: enriched });
});

/**
 * Vendor respond to review
 */
router.post('/:id/respond', authenticate, authorize('vendor'), [
  body('response').isString().trim().notEmpty().isLength({ max: 1000 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { data: vendor } = await supabase
    .from('vendors')
    .select('id')
    .eq('user_id', req.user.id)
    .single();

  const { data: review } = await supabase
    .from('reviews')
    .select('*')
    .eq('id', req.params.id)
    .eq('target_id', vendor.id)
    .eq('target_type', 'vendor')
    .single();

  if (!review) return res.status(404).json({ error: 'Review not found' });

  const { data: updated, error } = await supabase
    .from('reviews')
    .update({
      vendor_response: req.body.response,
      vendor_responded_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ review: updated });
});

module.exports = router;
