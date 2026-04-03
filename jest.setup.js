// jest.setup.js
const { webcrypto } = require('crypto');
const { TextEncoder, TextDecoder } = require('util');

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