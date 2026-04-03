// src/core/storage.js
import { safeParse, deepClone } from './utils';
import { StorageError, QuotaExceededError } from './errors';

class Persista {
  constructor(options = {}) {
    this.prefix = options.prefix || '';
    this.separator = options.separator || ':';
    this.debug = options.debug || false;
    this.events = new Map();

    // Build the prefix string
    if (this.prefix && !this.prefix.endsWith(this.separator)) {
      this.prefix = this.prefix + this.separator;
    }
  }

  // Internal: full key with prefix
  _getFullKey(key) {
    return this.prefix + key;
  }

  // Internal: logging if debug enabled
  _log(...args) {
    if (this.debug) {
      console.log('[persista]', ...args);
    }
  }

  // Internal: handle errors
  _handleError(operation, error) {
    if (this.debug) {
      console.error(`[persista error] ${operation}:`, error);
    }
    if (error.name === 'QuotaExceededError') {
      throw new QuotaExceededError(error.message);
    }
    throw new StorageError(`Failed to ${operation}: ${error.message}`);
  }

  /**
   * Set a value in storage
   * @param {string} key - Storage key
   * @param {*} value - Value to store (any type)
   * @returns {boolean} Success
   */
    set(key, value, options = {}) {
    try {
        const item = {
        value: deepClone(value),
        timestamp: Date.now(),
        expires: options.expires || null,   // null = never expires
        };
        const serialized = JSON.stringify(item);
        localStorage.setItem(this._getFullKey(key), serialized);
        this._log(`set: ${key}`, value);
        
        // Emit 'set' event
        this._emit('set', key, value, options);
        return true;
    } catch (error) {
        this._handleError('set', error);
        return false;
    }
    }

  /**
   * Get a value from storage
   * @param {string} key - Storage key
   * @param {*} defaultValue - Default if not found
   * @returns {*} Stored value or default
   */
    get(key, defaultValue = null) {
    try {
        const raw = localStorage.getItem(this._getFullKey(key));
        if (!raw) return defaultValue;

        const item = safeParse(raw);
        if (!item) return defaultValue;

        // --- Expiration check ---
        if (item.expires && (item.timestamp + item.expires) < Date.now()) {
        this._log(`expired: ${key}`);
        this.remove(key);                // delete expired data
        this._emit('expired', key, item.value);  // notify listeners
        return defaultValue;
        }

        this._log(`get: ${key}`, item.value);
        return deepClone(item.value);
    } catch (error) {
        this._handleError('get', error);
        return defaultValue;
    }
    }

  /**
   * Remove a key
   * @param {string} key - Storage key
   * @returns {boolean} Success
   */
    remove(key) {
    try {
        const fullKey = this._getFullKey(key);
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
   * Clear all items with this prefix
   * @returns {boolean} Success
   */
    clear() {
    try {
        const removedKeys = this.keys(); // get all keys before clearing
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.prefix)) {
            keysToRemove.push(key);
        }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        this._log('clear all');
        this._emit('clear', removedKeys);
        return true;
    } catch (error) {
        this._handleError('clear', error);
        return false;
    }
    }

  /**
   * Check if key exists
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return localStorage.getItem(this._getFullKey(key)) !== null;
  }

  /**
   * Get all keys (without prefix)
   * @returns {string[]}
   */
  keys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        keys.push(key.slice(this.prefix.length));
      }
    }
    return keys;
  }

    /**
     * Register an event listener
     * @param {string} event - 'set', 'remove', 'clear', 'expired'
     * @param {Function} callback
     */
    on(event, callback) {
    if (!this.events.has(event)) {
        this.events.set(event, new Set());
    }
    this.events.get(event).add(callback);
    return this; // for chaining
    }

    /**
     * Remove an event listener
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

    /**
     * Emit an event (internal)
     */
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

  /**
   * Get all stored values as object
   * @returns {Object}
   */
  all() {
    const result = {};
    this.keys().forEach(key => {
      result[key] = this.get(key);
    });
    return result;
  }

  /**
   * Get number of stored items
   * @returns {number}
   */
  count() {
    return this.keys().length;
  }

  /**
   * Get accurate storage usage in bytes (keys + values)
   * @returns {number} Total bytes used
   */
  getSize() {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        total += key.length * 2; // key bytes
        const value = localStorage.getItem(key);
        if (value) total += value.length * 2; // value bytes
      }
    }
    return total;
  }

  /**
   * @deprecated Use getSize() instead
   * Get approximate storage size in bytes
   * @returns {number}
   */
  size() {
    return this.getSize();
  }

  /**
   * Get storage usage as percentage of quota
   * @param {number} quotaMax - Maximum quota in bytes (default 5MB = 5242880)
   * @returns {number} Percentage (0-100)
   */
  getUsage(quotaMax = 5 * 1024 * 1024) {
    const used = this.getSize();
    return (used / quotaMax) * 100;
  }

  /**
   * Get remaining space in bytes
   * @param {number} quotaMax - Maximum quota in bytes (default 5MB)
   * @returns {number} Remaining bytes
   */
  getRemainingSpace(quotaMax = 5 * 1024 * 1024) {
    const used = this.getSize();
    return Math.max(0, quotaMax - used);
  }

  /**
   * Get detailed info about a specific key
   * @param {string} key
   * @returns {Object|null} { size, created, expires, lastAccessed, valueType }
   */
  getInfo(key) {
    const fullKey = this._getFullKey(key);
    const raw = localStorage.getItem(fullKey);
    if (!raw) return null;

    const item = safeParse(raw);
    if (!item) return null;

    const info = {
      key: key,
      size: fullKey.length * 2 + (raw.length * 2),
      created: item.timestamp,
      expires: item.expires ? item.timestamp + item.expires : null,
      valueType: Array.isArray(item.value) ? 'array' : typeof item.value,
      hasExpired: item.expires ? (item.timestamp + item.expires) < Date.now() : false
    };
    return info;
  }

  /**
   * Clean up storage based on rules
   * @param {Object} options
   * @param {number} options.olderThan - Remove items older than this ms
   * @param {number} options.keep - Keep at least this many newest items
   * @param {boolean} options.removeExpired - Remove expired items (default true)
   * @returns {number} Number of items removed
   */
  cleanup(options = {}) {
    const { olderThan = null, keep = null, removeExpired = true } = options;
    
    const allKeys = this.keys();
    const itemsToRemove = new Set();
    
    // Get all items with their timestamps
    const items = allKeys.map(key => {
      const info = this.getInfo(key);
      return { key, info };
    }).filter(item => item.info !== null);

    // 1. Remove expired items
    if (removeExpired) {
      items.forEach(({ key, info }) => {
        if (info.hasExpired) {
          itemsToRemove.add(key);
        }
      });
    }

    // 2. Remove items older than threshold
    if (olderThan !== null) {
      const cutoff = Date.now() - olderThan;
      items.forEach(({ key, info }) => {
        if (info.created < cutoff && !itemsToRemove.has(key)) {
          itemsToRemove.add(key);
        }
      });
    }

    // 3. Keep only N newest items (remove the oldest ones)
    if (keep !== null && items.length - itemsToRemove.size > keep) {
      const remainingItems = items
        .filter(({ key }) => !itemsToRemove.has(key))
        .sort((a, b) => b.info.created - a.info.created); // newest first
      
      const toRemoveFromKeep = remainingItems.slice(keep); // keep first N
      toRemoveFromKeep.forEach(({ key }) => itemsToRemove.add(key));
    }

    // Perform removal
    let removedCount = 0;
    for (const key of itemsToRemove) {
      this.remove(key);
      removedCount++;
    }

    this._log(`cleanup: removed ${removedCount} items`);
    return removedCount;
  }
  }

export default Persista;