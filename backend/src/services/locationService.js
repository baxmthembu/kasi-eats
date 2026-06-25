const { Client } = require("@googlemaps/google-maps-services-js");

const client = new Client({});
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Calculate distance between two coordinates using Haversine formula
 * @returns {number} Distance in kilometers
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Get matrix distance and duration using Google Distance Matrix API
 */
const getGoogleDistanceMatrix = async (origins, destinations) => {
  if (!GOOGLE_MAPS_API_KEY) return null;

  try {
    const response = await client.distancematrix({
      params: {
        origins,
        destinations,
        key: GOOGLE_MAPS_API_KEY,
        departure_time: "now",
      },
    });

    if (response.data.status === "OK") {
      return response.data.rows[0].elements[0];
    }
    return null;
  } catch (err) {
    console.error("Google Distance Matrix error:", err.message);
    return null;
  }
};

/**
 * Find items within a radius of a point
 */
const findWithinRadius = (items, centerLat, centerLon, radiusKm = 10) => {
  return items
    .map((item) => ({
      ...item,
      distance: calculateDistance(
        centerLat,
        centerLon,
        item.latitude,
        item.longitude
      ),
    }))
    .filter((item) => item.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance);
};

/**
 * Estimate delivery time based on distance (Haversine fallback)
 */
const estimateDeliveryTime = (distanceKm) => {
  const travelMinutes = Math.ceil((distanceKm / 30) * 60);
  return travelMinutes + 5; // Add buffer
};

module.exports = { 
  calculateDistance, 
  findWithinRadius, 
  estimateDeliveryTime, 
  getGoogleDistanceMatrix 
};
