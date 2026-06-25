/**
 * Maps API Proxy — routes all Google Maps calls through the backend
 * so the API key is never exposed to client apps.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middleware/auth');
const {
  getPlacesAutocomplete,
  getPlaceDetails,
  geocodeAddress,
  reverseGeocode,
} = require('../services/geocodingService');
const { getRoute } = require('../services/routingService');

const router = express.Router();

// 60 map API calls per minute per user — generous for live tracking
const mapsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => (req.user?.id ? `maps_${req.user.id}` : req.ip),
  message: { error: 'Too many map requests, slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(authenticate);
router.use(mapsLimiter);

/**
 * GET /api/maps/places/autocomplete?input=...&sessiontoken=...
 * Returns place suggestions restricted to South Africa
 */
router.get('/places/autocomplete', async (req, res) => {
  try {
    const { input, sessiontoken } = req.query;
    if (!input) return res.status(400).json({ error: 'input is required' });

    const predictions = await getPlacesAutocomplete(input, sessiontoken);
    res.json({ predictions });
  } catch (err) {
    console.error('Places autocomplete error:', err.message);
    res.status(502).json({ error: 'Places service unavailable' });
  }
});

/**
 * GET /api/maps/places/details?place_id=...&sessiontoken=...
 * Returns coordinates + formatted address for a place_id
 */
router.get('/places/details', async (req, res) => {
  try {
    const { place_id, sessiontoken } = req.query;
    if (!place_id) return res.status(400).json({ error: 'place_id is required' });

    const details = await getPlaceDetails(place_id, sessiontoken);
    res.json(details);
  } catch (err) {
    console.error('Place details error:', err.message);
    res.status(502).json({ error: 'Place details unavailable' });
  }
});

/**
 * POST /api/maps/geocode
 * Body: { address } OR { latitude, longitude }
 * Returns: { address, latitude, longitude }
 */
router.post('/geocode', async (req, res) => {
  try {
    const { address, latitude, longitude } = req.body;

    if (latitude !== undefined && longitude !== undefined) {
      const result = await reverseGeocode(parseFloat(latitude), parseFloat(longitude));
      return res.json(result);
    }

    if (address) {
      const result = await geocodeAddress(address);
      return res.json(result);
    }

    res.status(400).json({ error: 'Provide address or latitude+longitude' });
  } catch (err) {
    console.error('Geocode error:', err.message);
    res.status(502).json({ error: 'Geocoding service unavailable' });
  }
});

/**
 * GET /api/maps/route?fromLat=&fromLng=&toLat=&toLng=
 * Returns route info: { distanceKm, durationMin, rawPolyline }
 */
router.get('/route', async (req, res) => {
  try {
    const { fromLat, fromLng, toLat, toLng } = req.query;
    if (!fromLat || !fromLng || !toLat || !toLng) {
      return res.status(400).json({ error: 'fromLat, fromLng, toLat, toLng required' });
    }

    const route = await getRoute(
      parseFloat(fromLat),
      parseFloat(fromLng),
      parseFloat(toLat),
      parseFloat(toLng)
    );

    res.json(route);
  } catch (err) {
    console.error('Route error:', err.message);
    res.status(502).json({ error: 'Routing service unavailable' });
  }
});

module.exports = router;
