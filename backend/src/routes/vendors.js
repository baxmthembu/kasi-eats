/**
 * Vendors Routes
 * Browse vendors, menu endpoints
 */
const express = require('express');
const { body, query, validationResult, checkExact } = require('express-validator');
const { supabase } = require('../config/supabase');
const { authenticate, authorize } = require('../middleware/auth');
const { upload, uploadSingle } = require('../middleware/upload');
const { uploadImage } = require('../config/cloudinary');
const router = express.Router();

/**
 * Middleware: resolve the vendor record for an authenticated vendor user.
 * Attaches req.vendor = { id, ... } and short-circuits with 404 if not found.
 */
const resolveVendor = async (req, res, next) => {
  try {
    const { data: vendor, error } = await supabase
      .from('vendors')
      .select('id')
      .eq('user_id', req.user.id)
      .single();
    if (error || !vendor) return res.status(404).json({ error: 'Vendor profile not found.' });
    req.vendor = vendor;
    next();
  } catch (e) {
    res.status(500).json({ error: 'Failed to resolve vendor' });
  }
};

/**
 * List vendors (optional location filtering)
 * GET /api/vendors
 */
router.get('/', checkExact([
  query('lat').optional().isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
  query('lng').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
  query('radius_km').optional().isFloat({ min: 1, max: 100 }).withMessage('Invalid radius')
]), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { lat, lng, radius_km = 5 } = req.query;

  try {
    let query = supabase.from('vendors').select(`
      id, business_name, description, rating, total_reviews, is_open, cover_image,
      latitude, longitude
    `);

    // If location provided, we would normally use PostGIS here
    // e.g. ST_DWithin(location::geography, ST_MakePoint(lng, lat)::geography, radius * 1000)
    // For simplicity without RPC, we just return all open vendors for now if no PostGIS RPC is setup

    const { data: vendors, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Optional: filter by distance in nodejs if PostGIS is hard to query via simple rest
    res.json({ vendors });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
});



const profileValidation = [
  body('business_name').isString().trim().notEmpty().isLength({ max: 150 }).withMessage('Business name is required'),
  body('description').isString().trim().notEmpty().isLength({ max: 1000 }).withMessage('Description is required'),
  body('address').isString().trim().notEmpty().isLength({ max: 255 }).withMessage('Address is required'),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
  body('phone').isString().trim().notEmpty().isLength({ max: 20 }).withMessage('Phone is required'),
  body('cover_image').notEmpty().withMessage('Cover image is required'),
  body('is_open').isBoolean().withMessage('Shop open status is required')
];

/**
 * Upload Profile/Cover Image
 * POST /api/vendors/upload-image
 */
router.post('/upload-image', authenticate, authorize('vendor'), uploadSingle.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const uploadResult = await uploadImage(req.file.buffer, 'kasi-eats-vendor-profile');

    res.json({ url: uploadResult.secure_url, publicId: uploadResult.public_id });
  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

/**
 * Delete Profile/Cover Image
 * DELETE /api/vendors/delete-image
 */
router.delete('/delete-image', authenticate, authorize('vendor'), async (req, res) => {
  try {
    const { publicId } = req.body;
    if (!publicId) {
      return res.status(400).json({ error: 'Public ID required' });
    }

    const { deleteImage } = require('../config/cloudinary');
    await deleteImage(publicId);

    res.json({ success: true });
  } catch (error) {
    console.error('Image delete error:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

/**
 * Get Vendor Profile
 * GET /api/vendors/profile
 */
router.get('/profile', authenticate, authorize('vendor'), async (req, res) => {
  try {
    const { data: vendor, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    if (error || !vendor) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    res.json({ vendor });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * Toggle vendor open/closed status
 * PATCH /api/vendors/status
 */
router.patch('/status', authenticate, authorize('vendor'), async (req, res) => {
  const { is_open } = req.body;
  if (typeof is_open !== 'boolean') {
    return res.status(400).json({ error: 'is_open must be a boolean' });
  }
  try {
    const { data, error } = await supabase
      .from('vendors')
      .update({ is_open })
      .eq('user_id', req.user.id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ vendor: data });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

/**
 * Create or Update Vendor Profile
 * PUT /api/vendors/profile
 */
router.put('/profile', authenticate, authorize('vendor'), checkExact(profileValidation), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const userId = req.user.id;
    const {
      business_name,
      description,
      address,
      phone,
      cover_image,
      delivery_radius_km,
      min_order_amount,
      is_open,
      latitude,
      longitude,
      business_hours,
      category_tags,
    } = req.body;

    const updateData = { user_id: userId };
    if (business_name !== undefined) updateData.business_name = business_name;
    if (description !== undefined) updateData.description = description;
    if (address !== undefined) updateData.address = address;
    if (phone !== undefined) updateData.phone = phone;
    if (cover_image !== undefined) updateData.cover_image = cover_image;
    if (delivery_radius_km !== undefined) updateData.delivery_radius_km = delivery_radius_km;
    if (min_order_amount !== undefined) updateData.min_order_amount = min_order_amount;
    if (is_open !== undefined) updateData.is_open = is_open;
    if (latitude !== undefined) updateData.latitude = latitude;
    if (longitude !== undefined) updateData.longitude = longitude;
    if (business_hours !== undefined) updateData.business_hours = business_hours;
    if (category_tags !== undefined) updateData.category_tags = category_tags;

    const { data, error } = await supabase
      .from('vendors')
      .upsert(updateData, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ vendor: data });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});



/**
 * Get Own Menu Items
 * GET /api/vendors/menu
 */
router.get('/menu', authenticate, authorize('vendor'), resolveVendor, async (req, res) => {
  try {
    const { data: menuItems, error } = await supabase.from('menu_items').select('*').eq('vendor_id', req.vendor.id).order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json({ menu: menuItems || [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch menu items' });
  }
});

/**
 * Add Menu Item (Image upload)
 * POST /api/vendors/menu
 */
router.post('/menu', authenticate, authorize('vendor'), resolveVendor, upload.array('images', 5), async (req, res) => {
  try {
    const { name, description, price, is_available, category, preparation_time } = req.body;
    let image_urls = [];

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const uploadResult = await uploadImage(file.buffer, 'kasi-eats-menu');
        image_urls.push(uploadResult.secure_url);
      }
    }

    // Store array of URLs as a JSON string to fit in TEXT column
    const finalImageUrl = image_urls.length > 0 ? JSON.stringify(image_urls) : null;

    const { data: menuItem, error } = await supabase.from('menu_items').insert({
      vendor_id: req.vendor.id,
      name,
      description,
      price: parseFloat(price),
      image_url: finalImageUrl,
      category,
      preparation_time: parseInt(preparation_time) || 15,
      is_available: is_available === 'true' || is_available === true
    }).select().single();

    if (error) throw error;
    res.status(201).json({ item: menuItem });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to add item' });
  }
});

/**
 * PATCH Menu Item
 */
router.patch('/menu/:id', authenticate, authorize('vendor'), resolveVendor, upload.array('images', 5), async (req, res) => {
  try {
    const { id } = req.params;

    const update = {};
    const fields = ['name', 'description', 'price', 'category', 'preparation_time', 'is_available', 'category_id'];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) {
        if (f === 'price') update[f] = parseFloat(req.body[f]);
        else if (f === 'preparation_time') update[f] = parseInt(req.body[f], 10);
        else if (f === 'is_available') update[f] = req.body[f] === 'true' || req.body[f] === true;
        else update[f] = req.body[f];
      }
    });

    if (req.files?.length) {
      const image_urls = [];
      for (const file of req.files) {
        const uploadResult = await uploadImage(file.buffer, 'kasi-eats-menu');
        image_urls.push(uploadResult.secure_url);
      }
      update.image_url = JSON.stringify(image_urls);
    }

    const { data: menuItem, error } = await supabase
      .from('menu_items')
      .update(update)
      .eq('id', id)
      .eq('vendor_id', req.vendor.id)
      .select()
      .single();

    if (error) throw error;

    const io = req.app.get('io');
    const { emitMenuUpdated } = require('../websocket/handler');
    emitMenuUpdated(io, req.vendor.id, { action: 'updated', item: menuItem });

    res.json({ item: menuItem });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to update item' });
  }
});

router.patch('/menu/:id/availability', authenticate, authorize('vendor'), resolveVendor, async (req, res) => {
  const { is_available } = req.body;
  const { data, error } = await supabase
    .from('menu_items')
    .update({ is_available: !!is_available })
    .eq('id', req.params.id)
    .eq('vendor_id', req.vendor.id)
    .select()
    .single();

  if (error) return res.status(404).json({ error: 'Item not found' });
  res.json({ item: data });
});

router.post('/menu/bulk-availability', authenticate, authorize('vendor'), resolveVendor, async (req, res) => {
  const { is_available } = req.body;
  await supabase
    .from('menu_items')
    .update({ is_available: !!is_available })
    .eq('vendor_id', req.vendor.id);
  res.json({ success: true });
});

router.get('/menu/categories', authenticate, authorize('vendor'), resolveVendor, async (req, res) => {
  const { data, error } = await supabase
    .from('menu_categories')
    .select('*')
    .eq('vendor_id', req.vendor.id)
    .order('sort_order');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ categories: data || [] });
});

router.post('/menu/categories', authenticate, authorize('vendor'), resolveVendor, async (req, res) => {
  const { name, sort_order } = req.body;
  const { data, error } = await supabase
    .from('menu_categories')
    .insert({ vendor_id: req.vendor.id, name, sort_order: sort_order || 0 })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ category: data });
});

router.post('/push-token', authenticate, authorize('vendor'), async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  await supabase.from('vendors').update({ expo_push_token: token }).eq('user_id', req.user.id);
  res.json({ success: true });
});

/**
 * Delete Menu Item
 * DELETE /api/vendors/menu/:id
 */
router.delete('/menu/:id', authenticate, authorize('vendor'), resolveVendor, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('menu_items').delete().eq('id', id).eq('vendor_id', req.vendor.id);
    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

/**
 * Get vendor details + menu
 * GET /api/vendors/:id
 */
router.get('/:id', [
  // Validate id is string not empty, could be UUID
  query('id').optional().isString().trim()
], async (req, res) => {
  try {
    const { data: vendor, error: vendorError } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (vendorError || !vendor) return res.status(404).json({ error: 'Vendor not found' });

    const { data: menu } = await supabase
      .from('menu_items')
      .select('*')
      .eq('vendor_id', vendor.id)
      .eq('is_available', true);

    const { data: promotions } = await supabase
      .from('promotions')
      .select('*')
      .eq('vendor_id', vendor.id)
      .eq('is_active', true);

    const { data: combos } = await supabase
      .from('combo_meals')
      .select('*, combo_meal_items(*, menu_items(id, name, price, image_url))')
      .eq('vendor_id', vendor.id)
      .eq('is_available', true);

    res.json({
      vendor,
      menu: menu || [],
      promotions: promotions || [],
      combos: combos || [],
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch vendor' });
  }
});

module.exports = router;
