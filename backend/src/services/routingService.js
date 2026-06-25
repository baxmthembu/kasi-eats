const { Client } = require("@googlemaps/google-maps-services-js");

const client = new Client({});
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const MAPS_AXIOS_CONFIG = {
  headers: { Referer: process.env.GOOGLE_MAPS_REFERER || 'https://taskaroo.co.za' },
};

// Simple TTL cache to reduce Google API quota usage
const routeCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const getCacheKey = (fromLat, fromLng, toLat, toLng) =>
  `${fromLat.toFixed(3)},${fromLng.toFixed(3)}→${toLat.toFixed(3)},${toLng.toFixed(3)}`;

const getCached = (key) => {
  const entry = routeCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    routeCache.delete(key);
    return null;
  }
  return entry.value;
};

const setCache = (key, value) => {
  // Evict oldest entry if cache grows large
  if (routeCache.size > 500) {
    routeCache.delete(routeCache.keys().next().value);
  }
  routeCache.set(key, { value, ts: Date.now() });
};

/**
 * Fetch route from Google Directions API
 * @returns {{ distanceKm, durationMin, geometry }} or null on failure
 */
const fetchGoogleRoute = async (fromLat, fromLng, toLat, toLng) => {
  if (!GOOGLE_MAPS_API_KEY) {
    console.error("GOOGLE_MAPS_API_KEY is missing");
    return null;
  }

  const cacheKey = getCacheKey(fromLat, fromLng, toLat, toLng);
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const response = await client.directions({
      params: {
        origin: { latitude: fromLat, longitude: fromLng },
        destination: { latitude: toLat, longitude: toLng },
        mode: "driving",
        key: GOOGLE_MAPS_API_KEY,
      },
    }, MAPS_AXIOS_CONFIG);

    if (response.data.status !== "OK" || !response.data.routes[0]) {
      console.warn("Google Directions failed:", response.data.status);
      return null;
    }

    const route = response.data.routes[0];
    const leg = route.legs[0];

    const result = {
      distanceKm: Math.round((leg.distance.value / 1000) * 100) / 100,
      durationMin: Math.ceil(leg.duration.value / 60),
      geometry: {
        type: "LineString",
        coordinates: decodePolyline(route.overview_polyline.points),
      },
      rawPolyline: route.overview_polyline.points,
    };
    setCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error("Google route error:", err.message);
    return null;
  }
};

/**
 * Decode Google Maps polyline to coordinates [lng, lat]
 */
function decodePolyline(encoded) {
  let points = [];
  let index = 0, len = encoded.length;
  let lat = 0, lng = 0;

  while (index < len) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    points.push([lng * 1e-5, lat * 1e-5]); // GeoJSON order [lng, lat]
  }
  return points;
}

/**
 * Haversine fallback when API is unavailable
 */
const { calculateDistance, estimateDeliveryTime } = require("./locationService");

const haversineRoute = (fromLat, fromLng, toLat, toLng) => {
  const distanceKm = calculateDistance(fromLat, fromLng, toLat, toLng);
  return {
    distanceKm: Math.round(distanceKm * 100) / 100,
    durationMin: estimateDeliveryTime(distanceKm),
    geometry: {
      type: "LineString",
      coordinates: [
        [fromLng, fromLat],
        [toLng, toLat],
      ],
    },
  };
};

/**
 * Calculate a single leg route
 */
const getRoute = async (fromLat, fromLng, toLat, toLng) => {
  const route = await fetchGoogleRoute(fromLat, fromLng, toLat, toLng);
  if (route) return route;
  return haversineRoute(fromLat, fromLng, toLat, toLng);
};

/**
 * Calculate full delivery route: driver→vendor + vendor→customer
 */
const getDeliveryRoute = async (driverLat, driverLng, vendorLat, vendorLng, deliveryLat, deliveryLng) => {
  const leg1 = await getRoute(driverLat, driverLng, vendorLat, vendorLng);
  const leg2 = await getRoute(vendorLat, vendorLng, deliveryLat, deliveryLng);

  return {
    leg1,
    leg2,
    totalDistanceKm: Math.round((leg1.distanceKm + leg2.distanceKm) * 100) / 100,
    totalDurationMin: leg1.durationMin + leg2.durationMin,
  };
};

module.exports = { getRoute, getDeliveryRoute, fetchGoogleRoute, haversineRoute };
