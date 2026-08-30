// Sends push notifications through Expo's push service — free, no API key
// needed for our volume. A push failure should never break the request that
// triggered it (e.g. creating a Notification), so every function here
// swallows its own errors and just logs them.

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100; // Expo's documented max messages per request

const isExpoPushToken = (token) =>
  typeof token === "string" && token.startsWith("ExponentPushToken[");

// tokens: array of raw pushToken strings (nulls/invalid ones are filtered out).
exports.sendPushNotifications = async (tokens, title, body, data = {}) => {
  const validTokens = [...new Set(tokens)].filter(isExpoPushToken);
  if (validTokens.length === 0) return;

  const messages = validTokens.map((to) => ({
    to,
    sound: "default",
    title,
    body,
    data,
  }));

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        console.error("Expo push request failed:", res.status, await res.text());
      }
    } catch (err) {
      console.error("Expo push request errored:", err.message);
    }
  }
};
