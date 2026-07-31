(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.Persista = {}));
})(this, (function (exports) { 'use strict';

  function safeParse(json, fallback = null) {
    try {
      return JSON.parse(json);
    } catch {
      return fallback;
    }
  }

  function isPlainObject(obj) {
    return Object.prototype.toString.call(obj) === '[object Object]';
  }

  const MAP_TAG  = '__persista_map__';
  const SET_TAG  = '__persista_set__';
  const DATE_TAG = '__persista_date__';

  /**
   * Serialize Map, Set, and Date instances to JSON-compatible format.
   */
  function serialize(value) {
    if (value instanceof Map) {
      return {
        __type: MAP_TAG,
        entries: [...value.entries()].map(([k, v]) => [serialize(k), serialize(v)])
      };
    }
    if (value instanceof Set) {
      return {
        __type: SET_TAG,
        values: [...value.values()].map(serialize)
      };
    }
    if (value instanceof Date) {
      return { __type: DATE_TAG, iso: value.toISOString() };
    }
    if (Array.isArray(value)) return value.map(serialize);
    if (isPlainObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, serialize(v)])
      );
    }
    return value;
  }

  /**
   * Deserialize Map, Set, and Date instances.
   */
  function deserialize(value) {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(deserialize);

    if (value.__type === MAP_TAG) {
      return new Map(value.entries.map(([k, v]) => [deserialize(k), deserialize(v)]));
    }
    if (value.__type === SET_TAG) {
      return new Set(value.values.map(deserialize));
    }
    if (value.__type === DATE_TAG) {
      return new Date(value.iso);
    }

    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, deserialize(v)])
    );
  }

  /**
   * Get string representation of value type.
   */
  function getValueType(value) {
    if (value === null)       return 'null';
    if (Array.isArray(value)) return 'array';
    if (value instanceof Map) return 'map';
    if (value instanceof Set) return 'set';
    if (value instanceof Date) return 'date';
    return typeof value;
  }

  class StorageError extends Error {
    constructor(message) {
      super(message);
      this.name = 'StorageError';
    }
  }

  class QuotaExceededError extends StorageError {
    constructor(message = 'Storage quota exceeded') {
      super(message);
      this.name = 'QuotaExceededError';
    }
  }

  class ValidationError extends StorageError {
    constructor(message) {
      super(message);
      this.name = 'ValidationError';
    }
  }

  /**
   * Check whether a stored item has passed its expiry time.
   *
   * @param {{ timestamp: number, expires: number|null }} item
   * @returns {boolean}
   */
  function isExpired(item) {
    if (!item || !item.expires) return false;
    return (item.timestamp + item.expires) < Date.now();
  }

  /**
   * Calculate the absolute expiry timestamp for display / getInfo().
   *
   * @param {{ timestamp: number, expires: number|null }} item
   * @returns {number|null} Unix ms timestamp, or null if no expiry
   */
  function getExpiryTimestamp(item) {
    if (!item || !item.expires) return null;
    return item.timestamp + item.expires;
  }

  const PBKDF2_ITERATIONS = typeof process !== 'undefined' && process.env && process.env.PERSISTA_PBKDF2_ITERATIONS
    ? parseInt(process.env.PERSISTA_PBKDF2_ITERATIONS, 10)
    : 100000;

  function strToBuffer(str) {
    return new TextEncoder().encode(str);
  }

  /**
   * Convert Uint8Array to a Base64 string in chunks.
   */
  function bufferToBase64(bytes) {
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 0x8000;
    for (let i = 0; i < len; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }

  /**
   * Convert a Base64 string to a Uint8Array.
   */
  function base64ToBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Generate a cryptographic key using PBKDF2.
   */
  async function getCryptoKey(password, salt) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      strToBuffer(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt data using AES-GCM.
   */
  async function encrypt(data, password) {
    try {
      const jsonStr = JSON.stringify(data);
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv   = crypto.getRandomValues(new Uint8Array(12));
      const key = await getCryptoKey(password, salt);

      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        strToBuffer(jsonStr)
      );

      const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
      result.set(salt, 0);
      result.set(iv, salt.length);
      result.set(new Uint8Array(encrypted), salt.length + iv.length);

      return bufferToBase64(result);
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt data using AES-GCM.
   */
  async function decrypt(encryptedBase64, password) {
    try {
      const encryptedData = base64ToBuffer(encryptedBase64);
      const salt       = encryptedData.slice(0, 16);
      const iv         = encryptedData.slice(16, 28);
      const ciphertext = encryptedData.slice(28);

      const key = await getCryptoKey(password, salt);

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
      );

      return JSON.parse(new TextDecoder().decode(decrypted));
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  class Persista {
    /**
     * Create a new Persista instance.
     * @param {Object}  [options]
     * @param {string}  [options.prefix='']
     * @param {string}  [options.separator=':']
     * @param {boolean} [options.debug=false]
     * @param {{ key: string }} [options.encryption]
     */
    constructor(options = {}) {
      if (options.prefix !== undefined && typeof options.prefix !== 'string') {
        throw new ValidationError('Prefix option must be a string');
      }
      if (options.separator !== undefined && typeof options.separator !== 'string') {
        throw new ValidationError('Separator option must be a string');
      }
      if (options.debug !== undefined && typeof options.debug !== 'boolean') {
        throw new ValidationError('Debug option must be a boolean');
      }
      if (options.encryption !== undefined) {
        if (typeof options.encryption !== 'object' || options.encryption === null) {
          throw new ValidationError('Encryption option must be an object');
        }
        if (options.encryption.key !== undefined && (typeof options.encryption.key !== 'string' || !options.encryption.key)) {
          throw new ValidationError('Encryption key must be a non-empty string');
        }
      }

      this.prefix    = options.prefix    || '';
      this.separator = options.separator || ':';
      this.debug     = options.debug     || false;
      this.events    = new Map();

      this.encryptionKey     = options.encryption?.key || null;
      this.encryptionEnabled = !!this.encryptionKey;

      if (this.prefix && !this.prefix.endsWith(this.separator)) {
        this.prefix = this.prefix + this.separator;
      }

      if (typeof localStorage === 'undefined') {
        throw new StorageError('localStorage is not available in this environment');
      }

      if (this.encryptionEnabled && (typeof crypto === 'undefined' || !crypto.subtle)) {
        if (this.debug) {
          console.warn('[persista] Encryption enabled but Web Crypto API not available. Falling back to plain storage.');
        }
        this.encryptionEnabled = false;
        this.encryptionKey     = null;
      }
    }

    /**
     * Validate key format.
     * @private
     */
    _validateKey(key) {
      if (typeof key !== 'string' || !key) {
        throw new ValidationError('Storage key must be a non-empty string');
      }
    }

    /**
     * Get internal key representation.
     * @private
     */
    _getFullKey(key) {
      return this.prefix + key;
    }

    _log(...args) {
      if (this.debug) console.log('[persista]', ...args);
    }

    _handleError(operation, error) {
      if (this.debug) console.error(`[persista error] ${operation}:`, error);
      if (error instanceof ValidationError) throw error;
      
      if (
        error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        error.code === 22 ||
        error.code === 1014 ||
        /quota|exceeded|limit/i.test(error.message || '')
      ) {
        throw new QuotaExceededError(error.message);
      }
      
      throw new StorageError(`Failed to ${operation}: ${error.message}`);
    }

    /**
     * Set a value in storage.
     * @param {string}  key
     * @param {*}       value
     * @param {Object}  [options]
     * @param {number}  [options.expires]
     * @param {boolean} [options.encrypt]
     * @returns {Promise<boolean>}
     */
    async set(key, value, options = {}) {
      this._validateKey(key);
      if (options.expires !== undefined && options.expires !== null) {
        if (typeof options.expires !== 'number' || options.expires < 0) {
          throw new ValidationError('Expiration TTL must be a non-negative number');
        }
      }
      if (options.encrypt !== undefined && typeof options.encrypt !== 'boolean') {
        throw new ValidationError('Encrypt option must be a boolean');
      }

      try {
        if (options.encrypt === true && !this.encryptionEnabled) {
          if (this.debug) {
            console.warn('[persista] encrypt:true was passed but no encryption key is configured. Storing as plain text.');
          }
        }

        const shouldEncrypt = this.encryptionEnabled && options.encrypt !== false;
        const valueType = getValueType(value);
        let storedValue = serialize(value);

        if (shouldEncrypt) {
          storedValue = await encrypt(storedValue, this.encryptionKey);
        }

        const item = {
          value:     storedValue,
          valueType,
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
     * Get a value from storage.
     * @param {string} key
     * @param {*}      [defaultValue=null]
     * @returns {Promise<*>}
     */
    async get(key, defaultValue = null) {
      this._validateKey(key);
      try {
        const raw = localStorage.getItem(this._getFullKey(key));
        if (!raw) return defaultValue;

        const item = safeParse(raw);
        if (!item) return defaultValue;

        if (isExpired(item)) {
          this._log(`expired: ${key}`);
          this.remove(key, true);
          this._emit('expired', key, item.value);
          return defaultValue;
        }

        let value = item.value;

        if (item.encrypted && this.encryptionEnabled) {
          value = await decrypt(value, this.encryptionKey);
        }

        value = deserialize(value);
        this._log(`get: ${key}`, value);
        return value;
      } catch (error) {
        this._handleError('get', error);
        return defaultValue;
      }
    }

    /**
     * Remove a value from storage.
     * @param {string}  key
     * @param {boolean} [_isEviction=false]
     * @returns {boolean}
     */
    remove(key, _isEviction = false) {
      this._validateKey(key);
      try {
        const fullKey  = this._getFullKey(key);
        const existing = localStorage.getItem(fullKey);
        if (existing === null) return false;
        
        localStorage.removeItem(fullKey);
        this._log(`remove: ${key}`);
        if (!_isEviction) {
          this._emit('remove', key, existing ? safeParse(existing)?.value : null);
        }
        return true;
      } catch (error) {
        this._handleError('remove', error);
        return false;
      }
    }

    /**
     * Clear storage under the current prefix.
     * @returns {boolean}
     */
    clear() {
      try {
        const prefixedKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(this.prefix)) prefixedKeys.push(k);
        }

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

    /**
     * Check if a key exists in storage.
     * @param {string} key
     * @returns {boolean}
     */
    has(key) {
      this._validateKey(key);
      return localStorage.getItem(this._getFullKey(key)) !== null;
    }

    /**
     * Expiry-aware existence check.
     * @param {string} key
     * @returns {Promise<boolean>}
     */
    async hasValid(key) {
      this._validateKey(key);
      try {
        const raw = localStorage.getItem(this._getFullKey(key));
        if (!raw) return false;
        const item = safeParse(raw);
        if (!item) return false;
        if (isExpired(item)) {
          this._log(`expired: ${key}`);
          this.remove(key, true);
          this._emit('expired', key, item.value);
          return false;
        }
        return true;
      } catch (error) {
        this._handleError('hasValid', error);
        return false;
      }
    }

    /**
     * Get all unprefixed keys under the current prefix.
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
     * Get all entries as a plain object.
     * @returns {Promise<Record<string, *>>}
     */
    async all() {
      const keys = this.keys();
      const values = await Promise.all(keys.map(key => this.get(key)));
      const result = {};
      keys.forEach((key, index) => {
        result[key] = values[index];
      });
      return result;
    }

    /**
     * Get keys count.
     * @returns {number}
     */
    count() {
      return this.keys().length;
    }

    /**
     * Get total estimated byte size.
     * @returns {number}
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
     * Get usage percentage relative to quota.
     * @param {number} [quotaMax=5242880]
     * @returns {number}
     */
    getUsage(quotaMax = 5 * 1024 * 1024) {
      if (typeof quotaMax !== 'number' || quotaMax <= 0) {
        throw new ValidationError('quotaMax must be a positive number');
      }
      return (this.getSize() / quotaMax) * 100;
    }

    /**
     * Get estimated remaining storage space in bytes.
     * @param {number} [quotaMax=5242880]
     * @returns {number}
     */
    getRemainingSpace(quotaMax = 5 * 1024 * 1024) {
      if (typeof quotaMax !== 'number' || quotaMax <= 0) {
        throw new ValidationError('quotaMax must be a positive number');
      }
      return Math.max(0, quotaMax - this.getSize());
    }

    /**
     * Get metadata info for a key.
     * @param {string} key
     * @returns {Object|null}
     */
    getInfo(key) {
      this._validateKey(key);
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
        valueType:  item.valueType ?? (Array.isArray(item.value) ? 'array' : typeof item.value),
        hasExpired: isExpired(item)
      };
    }

    /**
     * Remove items matching cleanup criteria.
     * @param {Object}  [options]
     * @param {number}  [options.olderThan]
     * @param {number}  [options.keep]
     * @param {boolean} [options.removeExpired=true]
     * @returns {number}
     */
    cleanup(options = {}) {
      const { olderThan = null, keep = null, removeExpired = true } = options;

      if (olderThan !== null) {
        if (typeof olderThan !== 'number' || olderThan < 0) {
          throw new ValidationError('olderThan option must be a non-negative number');
        }
      }
      if (keep !== null) {
        if (typeof keep !== 'number' || !Number.isInteger(keep) || keep < 0) {
          throw new ValidationError('keep option must be a non-negative integer');
        }
      }
      if (typeof removeExpired !== 'boolean') {
        throw new ValidationError('removeExpired option must be a boolean');
      }

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
          .sort((a, b) => {
            if (b.info.created !== a.info.created) {
              return b.info.created - a.info.created;
            }
            return a.key.localeCompare(b.key);
          });

        remaining.slice(keep).forEach(({ key }) => itemsToRemove.add(key));
      }

      let removedCount = 0;
      for (const key of itemsToRemove) {
        this.remove(key, true);
        removedCount++;
      }

      this._log(`cleanup: removed ${removedCount} items`);
      return removedCount;
    }

    /**
     * Register event listener.
     * @param {string}   event
     * @param {Function} callback
     * @returns {this}
     */
    on(event, callback) {
      if (typeof event !== 'string') {
        throw new ValidationError('Event name must be a string');
      }
      if (typeof callback !== 'function') {
        throw new ValidationError('Event callback must be a function');
      }
      if (!this.events.has(event)) this.events.set(event, new Set());
      this.events.get(event).add(callback);
      return this;
    }

    /**
     * Remove event listener.
     * @param {string}   event
     * @param {Function} [callback]
     * @returns {this}
     */
    off(event, callback) {
      if (typeof event !== 'string') {
        throw new ValidationError('Event name must be a string');
      }
      if (callback !== undefined && typeof callback !== 'function') {
        throw new ValidationError('Event callback must be a function');
      }
      if (!this.events.has(event)) return this;
      if (callback) {
        this.events.get(event).delete(callback);
      } else {
        this.events.get(event).clear();
      }
      return this;
    }

    /**
     * Emit event notification.
     * @private
     */
    _emit(event, ...args) {
      if (!this.events.has(event)) return;
      const listeners = Array.from(this.events.get(event));
      for (const cb of listeners) {
        try {
          cb(...args);
        } catch (err) {
          this._log(`Error in ${event} listener:`, err);
        }
      }
    }
  }

  exports.QuotaExceededError = QuotaExceededError;
  exports.StorageError = StorageError;
  exports.ValidationError = ValidationError;
  exports.default = Persista;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=persista.js.map
