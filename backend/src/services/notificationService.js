/**
 * Notification Service — Expo push for drivers and vendors
 */

const sendExpoPush = async (expoPushToken, { title, body, data = {}, channelId = 'default' }) => {
  if (!expoPushToken || !expoPushToken.startsWith('ExponentPushToken')) {
    return { success: false, reason: 'invalid_token' };
  }

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(process.env.EXPO_ACCESS_TOKEN
          ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        to: expoPushToken,
        sound: 'default',
        title,
        body,
        data,
        priority: 'high',
        channelId,
      }),
    });

    const result = await response.json();
    return { success: true, result };
  } catch (err) {
    console.warn('Push notification failed:', err.message);
    return { success: false, error: err.message };
  }
};

const sendPushToDriver = (token, payload) =>
  sendExpoPush(token, { ...payload, channelId: 'delivery-requests' });

const sendPushToVendor = (token, payload) =>
  sendExpoPush(token, { ...payload, channelId: 'vendor-orders' });

module.exports = { sendPushToDriver, sendPushToVendor, sendExpoPush };
