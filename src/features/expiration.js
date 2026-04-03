// src/features/expiration.js

/**
 * Check whether a stored item has passed its expiry time.
 *
 * @param {{ timestamp: number, expires: number|null }} item
 * @returns {boolean}
 */
export function isExpired(item) {
  if (!item || !item.expires) return false;
  return (item.timestamp + item.expires) < Date.now();
}

/**
 * Calculate the absolute expiry timestamp for display / getInfo().
 *
 * @param {{ timestamp: number, expires: number|null }} item
 * @returns {number|null} Unix ms timestamp, or null if no expiry
 */
export function getExpiryTimestamp(item) {
  if (!item || !item.expires) return null;
  return item.timestamp + item.expires;
}