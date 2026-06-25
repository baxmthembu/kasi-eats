const { Client } = require('@googlemaps/google-maps-services-js');

const client = new Client({});
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Google API key is restricted to HTTP referrer — send it on every server-side call
const MAPS_AXIOS_CONFIG = {
  headers: { Referer: process.env.GOOGLE_MAPS_REFERER || 'https://taskaroo.co.za' },
};

/**
 * Autocomplete place suggestions — restricted to South Africa
 */
const getPlacesAutocomplete = async (input, sessiontoken) => {
  if (!input || input.length < 2) return [];

  const response = await client.placeAutocomplete({
    params: {
      input,
      key: GOOGLE_MAPS_API_KEY,
      language: 'en',
      components: ['country:za'],
      sessiontoken,
    },
  }, MAPS_AXIOS_CONFIG);

  if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
    const msg = `Places autocomplete failed: ${response.data.status}`;
    if (response.data.status === 'REQUEST_DENIED') {
      console.error('[geocoding] REQUEST_DENIED — check API key application restrictions. HTTP referrer restrictions do not work for server-side calls. Set restriction to "None" or use IP restrictions in Google Cloud Console.');
    }
    throw new Error(msg);
  }

  return (response.data.predictions || []).map((p) => ({
    place_id: p.place_id,
    description: p.description,
    main_text: p.structured_formatting?.main_text,
    secondary_text: p.structured_formatting?.secondary_text,
  }));
};

/**
 * Fetch coordinates and formatted address for a place_id
 */
const getPlaceDetails = async (placeId, sessiontoken) => {
  const response = await client.placeDetails({
    params: {
      place_id: placeId,
      key: GOOGLE_MAPS_API_KEY,
      fields: ['geometry', 'formatted_address', 'name'],
      sessiontoken,
    },
  }, MAPS_AXIOS_CONFIG);

  if (response.data.status !== 'OK') {
    throw new Error(`Place details failed: ${response.data.status}`);
  }

  const result = response.data.result;
  return {
    address: result.formatted_address,
    latitude: result.geometry.location.lat,
    longitude: result.geometry.location.lng,
  };
};

/**
 * Forward geocode: address string → coordinates
 */
const geocodeAddress = async (address) => {
  const response = await client.geocode({
    params: { address, key: GOOGLE_MAPS_API_KEY, region: 'za' },
  }, MAPS_AXIOS_CONFIG);

  if (response.data.status !== 'OK' || !response.data.results[0]) {
    throw new Error(`Geocoding failed: ${response.data.status}`);
  }

  const result = response.data.results[0];
  return {
    address: result.formatted_address,
    latitude: result.geometry.location.lat,
    longitude: result.geometry.location.lng,
  };
};

/**
 * Reverse geocode: coordinates → formatted address
 */
const reverseGeocode = async (latitude, longitude) => {
  const response = await client.reverseGeocode({
    params: {
      latlng: { lat: latitude, lng: longitude },
      key: GOOGLE_MAPS_API_KEY,
      language: 'en',
    },
  }, MAPS_AXIOS_CONFIG);

  if (response.data.status !== 'OK' || !response.data.results[0]) {
    throw new Error(`Reverse geocoding failed: ${response.data.status}`);
  }

  return {
    address: response.data.results[0].formatted_address,
    latitude,
    longitude,
  };
};

module.exports = { getPlacesAutocomplete, getPlaceDetails, geocodeAddress, reverseGeocode };
