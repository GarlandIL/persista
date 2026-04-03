const { webcrypto } = require('crypto');
const { TextEncoder, TextDecoder } = require('util');

// Use 1 PBKDF2 iteration in tests — production uses 100,000.
// This cuts encryption test time from ~30s down to ~1s while keeping
// all functional behaviour identical. Never set this in production code.
process.env.PERSISTA_PBKDF2_ITERATIONS = '1';

// Polyfill crypto.subtle (jsdom doesn't include it)
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: false,
    configurable: true,
  });
}

// Polyfill TextEncoder / TextDecoder (missing in some jsdom versions)
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}