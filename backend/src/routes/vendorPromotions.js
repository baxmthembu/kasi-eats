/**
 * Vendor promotions and combo meals
 */
const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { supabase } = require('../config/supabase');
const { authenticate, authorize } = require('../middleware/auth');
const { scanUploadedImages, upload, uploadSingle } = require('../middleware/upload');
const { uploadImage } = require('../config/cloudinary');
const { emitPromotionUpdate } = require('../websocket/handler');

const router = express.Router();

const getVendor = async (userId) => {
  const { data } = await supabase.from('vendors').select('id').eq('user_id', userId).single();
  return data;
};

// Only these columns may be written via PATCH — never trust req.body wholesale
// (it must never be able to touch vendor_id or reassign a row to another vendor).
const PROMOTION_WRITABLE_FIELDS = ['title', 'description', 'type', 'discount_value', 'menu_item_ids', 'banner_url', 'is_active', 'starts_at', 'ends_at'];
const COMBO_WRITABLE_FIELDS = ['name', 'description', 'price', 'image_url', 'is_available', 'starts_at', 'ends_at'];

const pickFields = (source, fields) => {
  const result = {};
  for (const field of fields) {
    if (source[field] !== undefined) result[field] = source[field];
  }
  return result;
};

// ─── PROMOTIONS ─────────────────────────────────────────────

router.get('/promotions', authenticate, authorize('vendor'), async (req, res) => {
  try {
    const vendor = await getVendor(req.user.id);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    const { data, error } = await supabase
      .from('promotions')
      .select('*')
      .eq('vendor_id', vendor.id)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ promotions: data || [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch promotions' });
  }
});

router.post('/promotions', authenticate, authorize('vendor'), [
  body('title').notEmpty().isLength({ max: 255 }),
  body('type').isIn(['percentage', 'bogo', 'fixed_amount', 'happy_hour']),
  body('discount_value').isFloat({ min: 0 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const vendor = await getVendor(req.user.id);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    const { data, error } = await supabase
      .from('promotions')
      .insert({ ...pickFields(req.body, PROMOTION_WRITABLE_FIELDS), vendor_id: vendor.id })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    const io = req.app.get('io');
    emitPromotionUpdate(io, vendor.id, { action: 'created', promotion: data });
    res.status(201).json({ promotion: data });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create promotion' });
  }
});

router.patch('/promotions/:id', authenticate, authorize('vendor'), async (req, res) => {
  try {
    const vendor = await getVendor(req.user.id);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    const updates = pickFields(req.body, PROMOTION_WRITABLE_FIELDS);
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No recognized fields to update' });
    }
    const { data, error } = await supabase
      .from('promotions')
      .update(updates)
      .eq('id', req.params.id)
      .eq('vendor_id', vendor.id)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ error: 'Promotion not found' });
    emitPromotionUpdate(req.app.get('io'), vendor.id, { action: 'updated', promotion: data });
    res.json({ promotion: data });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update promotion' });
  }
});

router.delete('/promotions/:id', authenticate, authorize('vendor'), async (req, res) => {
  try {
    const vendor = await getVendor(req.user.id);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    await supabase.from('promotions').delete().eq('id', req.params.id).eq('vendor_id', vendor.id);
    emitPromotionUpdate(req.app.get('io'), vendor.id, { action: 'deleted', promotionId: req.params.id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete promotion' });
  }
});

// ─── COMBOS ─────────────────────────────────────────────────

router.get('/combos', authenticate, authorize('vendor'), async (req, res) => {
  try {
    const vendor = await getVendor(req.user.id);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    const { data, error } = await supabase
      .from('combo_meals')
      .select('*, combo_meal_items(*, menu_items(id, name, price))')
      .eq('vendor_id', vendor.id)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ combos: data || [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch combos' });
  }
});

router.post('/combos', authenticate, authorize('vendor'), uploadSingle.single('image'), scanUploadedImages, async (req, res) => {
  try {
    const vendor = await getVendor(req.user.id);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    const { name, description, price, is_available, items } = req.body;

    let parsedItems;
    if (items !== undefined) {
      try {
        parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
      } catch (parseError) {
        return res.status(400).json({ error: 'Invalid combo items format' });
      }
    }

    let image_url = null;
    if (req.file) {
      const up = await uploadImage(req.file.buffer, 'kasi-eats-combos');
      image_url = up.secure_url;
    }

    const { data: combo, error } = await supabase
      .from('combo_meals')
      .insert({
        vendor_id: vendor.id,
        name,
        description,
        price: parseFloat(price),
        image_url,
        is_available: is_available !== 'false',
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    if (parsedItems?.length) {
      await supabase.from('combo_meal_items').insert(
        parsedItems.map((i) => ({
          combo_id: combo.id,
          menu_item_id: i.menu_item_id,
          quantity: i.quantity || 1,
        }))
      );
    }

    emitPromotionUpdate(req.app.get('io'), vendor.id, { action: 'combo_created', combo });
    res.status(201).json({ combo });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create combo' });
  }
});

router.patch('/combos/:id', authenticate, authorize('vendor'), async (req, res) => {
  try {
    const vendor = await getVendor(req.user.id);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    const updates = pickFields(req.body, COMBO_WRITABLE_FIELDS);
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No recognized fields to update' });
    }
    const { data, error } = await supabase
      .from('combo_meals')
      .update(updates)
      .eq('id', req.params.id)
      .eq('vendor_id', vendor.id)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ error: 'Combo not found' });
    emitPromotionUpdate(req.app.get('io'), vendor.id, { action: 'combo_updated', combo: data });
    res.json({ combo: data });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update combo' });
  }
});

router.delete('/combos/:id', authenticate, authorize('vendor'), async (req, res) => {
  try {
    const vendor = await getVendor(req.user.id);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    await supabase.from('combo_meals').delete().eq('id', req.params.id).eq('vendor_id', vendor.id);
    emitPromotionUpdate(req.app.get('io'), vendor.id, { action: 'combo_deleted', comboId: req.params.id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete combo' });
  }
});

module.exports = router;
