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
export async function encrypt(data, password) {
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
export async function decrypt(encryptedBase64, password) {
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