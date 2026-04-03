import { safeParse, deepClone, serialize, deserialize, getValueType } from './utils';
import { StorageError, QuotaExceededError } from './errors';
import { isExpired, getExpiryTimestamp } from '../features/expiration';

class Persista {
  /**
   * Create a new Persista instance.
   *
   * @param {Object}  options
   * @param {string}  [options.prefix='']          - Key prefix to namespace this instance
   * @param {string}  [options.separator=':']      - Separator between prefix and key
   * @param {boolean} [options.debug=false]        - Log operations to console
   * @param {{ key: string }} [options.encryption] - Enable AES-GCM encryption
   */
  constructor(options = {}) {
    this.prefix    = options.prefix    || '';
    this.separator = options.separator || ':';
    this.debug     = options.debug     || false;
    this.events    = new Map();

    this.encryptionKey     = options.encryption?.key || null;
    this.encryptionEnabled = !!this.encryptionKey;

    // Append separator to prefix once, so _getFullKey is a simple concatenation
    if (this.prefix && !this.prefix.endsWith(this.separator)) {
      this.prefix = this.prefix + this.separator;
    }

    if (typeof localStorage === 'undefined') {
      throw new StorageError('localStorage is not available in this environment');
    }

    if (this.encryptionEnabled && typeof crypto === 'undefined') {
      if (this.debug) {
        console.warn('[persista] Encryption enabled but Web Crypto API not available. Falling back to plain storage.');
      }
      this.encryptionEnabled = false;
      this.encryptionKey     = null;
    }
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  /**
   * Returns the full localStorage key for a given user-facing key.
   * Intentionally accessible (no truly private methods in ES6 classes) —
   * useful for tests that need to read/manipulate raw storage entries.
   */
  _getFullKey(key) {
    return this.prefix + key;
  }

  _log(...args) {
    if (this.debug) console.log('[persista]', ...args);
  }

  _handleError(operation, error) {
    if (this.debug) console.error(`[persista error] ${operation}:`, error);
    if (error.name === 'QuotaExceededError') throw new QuotaExceededError(error.message);
    throw new StorageError(`Failed to ${operation}: ${error.message}`);
  }

  // ─── Core API ────────────────────────────────────────────────────────────────

  /**
   * Store a value. Returns true on success.
   * Always async — keeps the API stable whether or not encryption is in use.
   *
   * FIX #2: valueType is captured BEFORE encryption so getInfo() always
   * reports the original type rather than 'string' (the ciphertext type).
   *
   * FIX #12: passing encrypt:true when the instance has no key now logs a
   * warning in debug mode rather than silently doing nothing.
   *
   * @param {string}  key
   * @param {*}       value
   * @param {Object}  [options]
   * @param {number}  [options.expires]  - TTL in milliseconds
   * @param {boolean} [options.encrypt]  - Override instance encryption setting
   * @returns {Promise<boolean>}
   */
  async set(key, value, options = {}) {
    try {
      // FIX #12: warn when caller asks to encrypt but instance has no key
      if (options.encrypt === true && !this.encryptionEnabled) {
        if (this.debug) {
          console.warn('[persista] encrypt:true was passed but no encryption key is configured on this instance. Storing as plain text.');
        }
      }

      const shouldEncrypt = this.encryptionEnabled && options.encrypt !== false;

      // FIX #2: capture valueType from the ORIGINAL value, before any transformation
      const valueType = getValueType(value);

      // Serialize first (handles Map/Set/Date) then optionally encrypt
      let storedValue = serialize(deepClone(value));

      if (shouldEncrypt) {
        const { encrypt } = await import('../features/encryption');
        storedValue = await encrypt(storedValue, this.encryptionKey);
      }

      const item = {
        value:     storedValue,
        valueType, // FIX #2: stored in envelope so getInfo() can read it regardless of encryption
        timestamp: Date.now(),
        expires:   options.expires ?? null,
        encrypted: shouldEncrypt
      };

      localStorage.setItem(this._getFullKey(key), JSON.stringify(item));
      this._log(`set: ${key}`, value);
      this._emit('set', key, value, options);
      return true;
    } catch (error) {
      this._handleError('set', error);
      return false;
    }
  }

  /**
   * Retrieve a value. Returns defaultValue if the key is missing or expired.
   * Always async — keeps the API stable whether or not encryption is in use.
   *
   * @param {string} key
   * @param {*}      [defaultValue=null]
   * @returns {Promise<*>}
   */
  async get(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(this._getFullKey(key));
      if (!raw) return defaultValue;

      const item = safeParse(raw);
      if (!item) return defaultValue;

      // Check expiration using the helper from expiration.js
      if (isExpired(item)) {
        this._log(`expired: ${key}`);
        this.remove(key);
        this._emit('expired', key, item.value);
        return defaultValue;
      }

      let value = item.value;

      // Decrypt if necessary, then deserialize (restores Map/Set/Date)
      if (item.encrypted && this.encryptionEnabled) {
        const { decrypt } = await import('../features/encryption');
        value = await decrypt(value, this.encryptionKey);
      }

      value = deserialize(value);

      this._log(`get: ${key}`, value);
      return deepClone(value);
    } catch (error) {
      this._handleError('get', error);
      return defaultValue;
    }
  }

  /**
   * Remove a single key. Synchronous.
   * @param {string} key
   * @returns {boolean}
   */
  remove(key) {
    try {
      const fullKey  = this._getFullKey(key);
      const existing = localStorage.getItem(fullKey);
      localStorage.removeItem(fullKey);
      this._log(`remove: ${key}`);
      this._emit('remove', key, existing ? safeParse(existing)?.value : null);
      return true;
    } catch (error) {
      this._handleError('remove', error);
      return false;
    }
  }

  /**
   * Remove all keys belonging to this instance's prefix. Synchronous.
   *
   * Single pass: collect the prefixed keys, fire the event with the
   * unprefixed names, then delete. Avoids the double-iteration bug where
   * keys() and the deletion loop could see different state.
   *
   * @returns {boolean}
   */
  clear() {
    try {
      // Single pass over localStorage
      const prefixedKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(this.prefix)) prefixedKeys.push(k);
      }

      // Derive the user-facing (unprefixed) names for the event
      const unprefixedKeys = prefixedKeys.map(k => k.slice(this.prefix.length));

      prefixedKeys.forEach(k => localStorage.removeItem(k));

      this._log('clear all');
      this._emit('clear', unprefixedKeys);
      return true;
    } catch (error) {
      this._handleError('clear', error);
      return false;
    }
  }

  // ─── Query API (all synchronous) ─────────────────────────────────────────────

  /**
   * Check whether a key exists in storage. Synchronous. Does NOT check expiry.
   *
   * If you need to know whether an item is still valid (not expired), use
   * get() instead — it removes expired items and returns null for them.
   * Alternatively, use hasValid() for a convenience expiry-aware check.
   *
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return localStorage.getItem(this._getFullKey(key)) !== null;
  }

  /**
   * FIX #1: Expiry-aware existence check. Returns true only if the key exists
   * AND has not yet expired. Async because it delegates to get().
   *
   * Unlike has(), this removes the expired item as a side-effect (same as get()).
   *
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async hasValid(key) {
    const value = await this.get(key);
    return value !== null;
  }

  /**
   * Return all keys belonging to this prefix (without the prefix). O(n).
   * @returns {string[]}
   */
  keys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(this.prefix)) keys.push(k.slice(this.prefix.length));
    }
    return keys;
  }

  /**
   * Return all stored key-value pairs as a plain object.
   * Async because individual get() calls may need to decrypt.
   * Failed decryptions return null for that key and do not throw.
   * @returns {Promise<Record<string, *>>}
   */
  async all() {
    const result = {};
    for (const key of this.keys()) {
      result[key] = await this.get(key);
    }
    return result;
  }

  /**
   * Return the number of keys stored under this prefix. O(n).
   * @returns {number}
   */
  count() {
    return this.keys().length;
  }

  // ─── Storage monitoring (all synchronous) ────────────────────────────────────

  /**
   * Return the total bytes used by this prefix.
   *
   * localStorage internally stores strings as UTF-16 (2 bytes per character)
   * in most browser implementations. Multiplying character length by 2 gives
   * a close approximation. Actual browser accounting may differ slightly.
   *
   * @returns {number} Estimated bytes used
   */
  getSize() {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        total += key.length * 2;
        const val = localStorage.getItem(key);
        if (val) total += val.length * 2;
      }
    }
    return total;
  }

  /**
   * @deprecated Use getSize() instead.
   */
  size() {
    return this.getSize();
  }

  /**
   * Return storage usage as a percentage of the given quota.
   * Note: this reflects only this instance's data vs. the shared browser quota.
   *
   * @param {number} [quotaMax=5242880] - Quota in bytes (default 5 MB)
   * @returns {number} Percentage between 0 and 100
   */
  getUsage(quotaMax = 5 * 1024 * 1024) {
    return (this.getSize() / quotaMax) * 100;
  }

  /**
   * Return estimated remaining space in bytes.
   * @param {number} [quotaMax=5242880]
   * @returns {number}
   */
  getRemainingSpace(quotaMax = 5 * 1024 * 1024) {
    return Math.max(0, quotaMax - this.getSize());
  }

  /**
   * Return metadata about a specific key.
   *
   * FIX #2: valueType is now read from the stored envelope (set at write-time
   * before any encryption), so it always reflects the original data type even
   * for encrypted items.
   *
   * @param {string} key
   * @returns {{ key, size, created, expires, valueType, hasExpired } | null}
   */
  getInfo(key) {
    const fullKey = this._getFullKey(key);
    const raw     = localStorage.getItem(fullKey);
    if (!raw) return null;

    const item = safeParse(raw);
    if (!item) return null;

    return {
      key,
      size:      fullKey.length * 2 + raw.length * 2,
      created:   item.timestamp,
      expires:   getExpiryTimestamp(item),
      // FIX #2: read valueType from envelope; fall back gracefully for items
      // written by older versions of the library that didn't store it.
      valueType:  item.valueType ?? (Array.isArray(item.value) ? 'array' : typeof item.value),
      hasExpired: isExpired(item)
    };
  }

  /**
   * Remove items matching the given criteria.
   *
   * @param {Object}  [options]
   * @param {number}  [options.olderThan]          - Remove items older than N ms
   * @param {number}  [options.keep]               - Keep only the N newest items
   * @param {boolean} [options.removeExpired=true] - Remove expired items
   * @returns {number} Number of items removed
   */
  cleanup(options = {}) {
    const { olderThan = null, keep = null, removeExpired = true } = options;

    const allKeys       = this.keys();
    const itemsToRemove = new Set();

    const items = allKeys
      .map(key => ({ key, info: this.getInfo(key) }))
      .filter(({ info }) => info !== null);

    if (removeExpired) {
      items.forEach(({ key, info }) => {
        if (info.hasExpired) itemsToRemove.add(key);
      });
    }

    if (olderThan !== null) {
      const cutoff = Date.now() - olderThan;
      items.forEach(({ key, info }) => {
        if (info.created < cutoff) itemsToRemove.add(key);
      });
    }

    if (keep !== null && items.length - itemsToRemove.size > keep) {
      const remaining = items
        .filter(({ key }) => !itemsToRemove.has(key))
        .sort((a, b) => b.info.created - a.info.created); // newest first

      remaining.slice(keep).forEach(({ key }) => itemsToRemove.add(key));
    }

    let removedCount = 0;
    for (const key of itemsToRemove) {
      this.remove(key);
      removedCount++;
    }

    this._log(`cleanup: removed ${removedCount} items`);
    return removedCount;
  }

  // ─── Event system ────────────────────────────────────────────────────────────

  /**
   * Register an event listener.
   * @param {'set'|'get'|'remove'|'clear'|'expired'} event
   * @param {Function} callback
   * @returns {this} for chaining
   */
  on(event, callback) {
    if (!this.events.has(event)) this.events.set(event, new Set());
    this.events.get(event).add(callback);
    return this;
  }

  /**
   * Remove an event listener.
   * @param {string}   event
   * @param {Function} [callback] - Omit to remove all listeners for the event
   * @returns {this}
   */
  off(event, callback) {
    if (!this.events.has(event)) return this;
    if (callback) {
      this.events.get(event).delete(callback);
    } else {
      this.events.get(event).clear();
    }
    return this;
  }

  _emit(event, ...args) {
    if (!this.events.has(event)) return;
    for (const cb of this.events.get(event)) {
      try {
        cb(...args);
      } catch (err) {
        this._log(`Error in ${event} listener:`, err);
      }
    }
  }
}

export default Persista;