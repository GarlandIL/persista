// src/features/encryption.js

/**
 * Convert string to ArrayBuffer for crypto operations
 */
function strToBuffer(str) {
  return new TextEncoder().encode(str);
}

/**
 * Generate a cryptographic key from a password string and a salt.
 *
 * The salt parameter is already a Uint8Array (generated via
 * crypto.getRandomValues). We must pass it directly to deriveKey — NOT
 * re-encode it with TextEncoder, which would encode the array's string
 * representation ("0,123,45,...") instead of the actual bytes.
 *
 * @param {string}     password - The user-supplied encryption key
 * @param {Uint8Array} salt     - Raw random salt bytes
 * @returns {Promise<CryptoKey>}
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
      salt: salt,       // pass the Uint8Array directly — NOT encoder.encode(salt)
      iterations: 100000,
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
 *
 * Layout of the stored byte string (before base64):
 *   [ 16 bytes salt ][ 12 bytes IV ][ N bytes ciphertext ]
 *
 * @param {any}    data     - Any JSON-serialisable value
 * @param {string} password - Encryption password
 * @returns {Promise<string>} Base64-encoded encrypted payload
 */
export async function encrypt(data, password) {
  try {
    const jsonStr = JSON.stringify(data);

    // Random salt (16 bytes) and IV (12 bytes) — new values every call
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));

    const key = await getCryptoKey(password, salt);

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      strToBuffer(jsonStr)
    );

    // Pack: salt | iv | ciphertext → base64
    const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    result.set(salt, 0);
    result.set(iv, salt.length);
    result.set(new Uint8Array(encrypted), salt.length + iv.length);

    return btoa(String.fromCharCode(...result));
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt data that was encrypted with encrypt().
 *
 * @param {string} encryptedBase64 - Base64 payload from encrypt()
 * @param {string} password        - Same password used to encrypt
 * @returns {Promise<any>} Original value
 */
export async function decrypt(encryptedBase64, password) {
  try {
    const binaryStr     = atob(encryptedBase64);
    const encryptedData = Uint8Array.from(binaryStr, c => c.charCodeAt(0));

    // Unpack salt | iv | ciphertext
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