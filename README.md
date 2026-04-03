# Persista

[![npm version](https://badge.fury.io/js/persista.svg)](https://www.npmjs.com/package/persista)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful `localStorage` wrapper with **expiration (TTL)**, **AES-GCM encryption**, **events**, **storage monitoring**, and **smart cleanup** — all with full type preservation for objects, arrays, Maps, Sets, and Dates.

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Constructor Options](#constructor-options)
- [API Reference](#api-reference)
  - [set()](#set)
  - [get()](#get)
  - [remove()](#remove)
  - [clear()](#clear)
  - [has()](#has)
  - [keys()](#keys)
  - [all()](#all)
  - [count()](#count)
  - [getSize()](#getsize)
  - [getUsage()](#getusage)
  - [getRemainingSpace()](#getremainingspace)
  - [getInfo()](#getinfo)
  - [cleanup()](#cleanup)
  - [on()](#on)
  - [off()](#off)
- [Async vs Sync Methods](#async-vs-sync-methods)
- [Type Preservation](#type-preservation)
- [Encryption](#encryption)
- [Expiration (TTL)](#expiration-ttl)
- [Events](#events)
- [Storage Monitoring](#storage-monitoring)
- [Smart Cleanup](#smart-cleanup)
- [Error Handling](#error-handling)
- [TypeScript](#typescript)
- [Changelog](#changelog)

---

## Features

| Feature | Description |
|---|---|
| 🔄 **Type preservation** | Stores and restores `number`, `boolean`, `object`, `array`, `Date`, `Map`, `Set` |
| ⏰ **Expiration (TTL)** | Auto-expire items after a given number of milliseconds |
| 🔐 **Encryption** | Per-instance or per-item AES-GCM encryption via the Web Crypto API |
| 📡 **Events** | Subscribe to `set`, `remove`, `clear`, `expired` events |
| 📊 **Storage monitoring** | Track bytes used, percentage of quota, and remaining space |
| 🧹 **Smart cleanup** | Remove expired, old, or excess items in one call |
| 🏷️ **Key prefixing** | Isolate one instance from another within the same origin |
| 🐛 **Debug mode** | Verbose console logging during development |
| 🟦 **TypeScript** | Full type definitions included |

---

## Installation

```bash
npm install persista
```

Or via CDN (UMD build):

```html
<script src="https://unpkg.com/persista/dist/persista.min.js"></script>
<script>
  const storage = new Persista({ prefix: 'myapp' });
</script>
```

---

## Quick Start

```js
import Persista from 'persista';

const storage = new Persista({ prefix: 'myapp' });

// Store any value
await storage.set('user', { name: 'Alice', role: 'admin' });

// Retrieve it
const user = await storage.get('user');
console.log(user.name); // 'Alice'

// Store with a 1-hour TTL
await storage.set('session', { token: 'abc123' }, { expires: 60 * 60 * 1000 });

// Check existence
if (storage.has('user')) {
  console.log('user is in storage');
}

// Remove
storage.remove('user');
```

---

## Constructor Options

```js
const storage = new Persista(options);
```

| Option | Type | Default | Description |
|---|---|---|---|
| `prefix` | `string` | `''` | Prepended to every key. Use this to namespace one instance from another. |
| `separator` | `string` | `':'` | Character placed between the prefix and key name. |
| `debug` | `boolean` | `false` | Log every operation to the console. |
| `encryption.key` | `string` | `undefined` | When provided, all values are encrypted with AES-GCM by default. |

```js
// Two isolated instances on the same page
const userStorage = new Persista({ prefix: 'user' });
const cacheStorage = new Persista({ prefix: 'cache' });

// With encryption enabled for all writes
const secureStorage = new Persista({
  prefix: 'secure',
  encryption: { key: 'my-secret-key-should-be-long' }
});

// Debug mode (logs every operation)
const devStorage = new Persista({ prefix: 'dev', debug: true });
```

---

## API Reference

### `set()`

```ts
set(key: string, value: any, options?: SetOptions): Promise<boolean>
```

Store any value under `key`. Always `await` this call.

**Options:**

| Option | Type | Description |
|---|---|---|
| `expires` | `number` | TTL in **milliseconds**. The item will return `null` after this time. |
| `encrypt` | `boolean` | Override the instance's encryption setting for this single call. |

```js
// Basic
await storage.set('theme', 'dark');

// With 10-minute TTL
await storage.set('otp', '483920', { expires: 10 * 60 * 1000 });

// Force-disable encryption for this one item (even if instance has encryption on)
await storage.set('publicData', { visible: true }, { encrypt: false });
```

Returns `true` on success. Throws a `StorageError` (or `QuotaExceededError`) on failure.

---

### `get()`

```ts
get(key: string, defaultValue?: any): Promise<any>
```

Retrieve a value by key. Always `await` this call.

- Returns `defaultValue` (default: `null`) if the key does not exist or has expired.
- Automatically decrypts if the item was stored with encryption.
- Automatically deletes expired items and fires the `'expired'` event.

```js
const theme = await storage.get('theme');           // 'dark' or null
const theme = await storage.get('theme', 'light');  // 'dark' or 'light'

const user = await storage.get('user');
if (user) {
  console.log(user.name);
}
```

---

### `remove()`

```ts
remove(key: string): boolean
```

Delete a single key. **Synchronous.**

```js
storage.remove('session');
```

Fires the `'remove'` event with the key and its previous value.

---

### `clear()`

```ts
clear(): boolean
```

Delete **all keys belonging to this instance's prefix**. Keys from other Persista instances (with different prefixes) are unaffected. **Synchronous.**

```js
storage.clear();
```

Fires the `'clear'` event with an array of the removed key names.

---

### `has()`

```ts
has(key: string): boolean
```

Check whether a key exists in storage. **Synchronous.** Does not check expiry — use `get()` if you need expiry-aware existence checking.

```js
if (storage.has('user')) {
  // key exists (may still be expired)
}
```

---

### `keys()`

```ts
keys(): string[]
```

Return all key names under this prefix, **without the prefix**. **Synchronous.**

```js
await storage.set('a', 1);
await storage.set('b', 2);
console.log(storage.keys()); // ['a', 'b']
```

---

### `all()`

```ts
all(): Promise<Record<string, any>>
```

Return every key-value pair as a plain object. **Async** (decryption may be needed).

```js
await storage.set('x', 1);
await storage.set('y', 2);
const everything = await storage.all();
// { x: 1, y: 2 }
```

---

### `count()`

```ts
count(): number
```

Return the number of keys stored under this prefix. **Synchronous.**

```js
console.log(storage.count()); // 3
```

---

### `getSize()`

```ts
getSize(): number
```

Return the estimated total bytes used by this instance (keys + values).

> **Implementation note:** localStorage stores strings internally as UTF-16 (2 bytes per character) in most browser engines. Persista multiplies character length × 2, which is the standard estimation approach. Actual browser-internal accounting may vary slightly.

```js
console.log(storage.getSize()); // e.g. 24576
```

---

### `getUsage()`

```ts
getUsage(quotaMax?: number): number
```

Return usage as a percentage of the given quota (default: 5 MB).

```js
console.log(storage.getUsage());        // e.g. 0.46  (percent of 5 MB)
console.log(storage.getUsage(2097152)); // percent of 2 MB
```

---

### `getRemainingSpace()`

```ts
getRemainingSpace(quotaMax?: number): number
```

Return estimated remaining bytes before quota is reached (default quota: 5 MB).

```js
console.log(storage.getRemainingSpace()); // e.g. 5218304
```

---

### `getInfo()`

```ts
getInfo(key: string): ItemInfo | null
```

Return detailed metadata about a single key. **Synchronous.**

```ts
interface ItemInfo {
  key:        string;
  size:       number;   // bytes (key + value, UTF-16 estimate)
  created:    number;   // Unix ms timestamp when item was stored
  expires:    number | null; // absolute Unix ms expiry timestamp, or null
  valueType:  string;   // 'string' | 'number' | 'boolean' | 'object' | 'array'
  hasExpired: boolean;
}
```

```js
await storage.set('token', 'abc', { expires: 3600000 });
const info = storage.getInfo('token');
// {
//   key:        'token',
//   size:       96,
//   created:    1713000000000,
//   expires:    1713003600000,
//   valueType:  'string',
//   hasExpired: false
// }
```

Returns `null` if the key does not exist.

---

### `cleanup()`

```ts
cleanup(options?: CleanupOptions): number
```

Remove items matching the given criteria. Returns the number of items removed. **Synchronous.**

```ts
interface CleanupOptions {
  removeExpired?: boolean; // default: true  — remove TTL-expired items
  olderThan?:     number;  // remove items created more than N ms ago
  keep?:          number;  // after other rules, keep only the N newest items
}
```

```js
// Remove only expired items (default behaviour)
storage.cleanup();

// Remove anything older than 7 days
storage.cleanup({ olderThan: 7 * 24 * 60 * 60 * 1000 });

// Keep at most 50 items (oldest removed first)
storage.cleanup({ keep: 50, removeExpired: false });

// All three rules at once
storage.cleanup({
  removeExpired: true,
  olderThan:     7 * 24 * 60 * 60 * 1000,
  keep:          100
});
```

---

### `on()`

```ts
on(event: EventName, callback: (...args: any[]) => void): this
```

Register an event listener. Returns `this` for chaining.

```js
storage
  .on('set',     (key, value, options) => console.log('stored', key))
  .on('remove',  (key, value)          => console.log('removed', key))
  .on('clear',   (keys)                => console.log('cleared', keys))
  .on('expired', (key, value)          => console.log('expired', key));
```

---

### `off()`

```ts
off(event: EventName, callback?: (...args: any[]) => void): this
```

Remove an event listener. Omit `callback` to remove all listeners for that event.

```js
const handler = (key) => console.log(key);
storage.on('remove', handler);
storage.off('remove', handler); // remove just this listener
storage.off('remove');          // remove ALL 'remove' listeners
```

---

## Async vs Sync Methods

Persista mixes async and sync methods. The split is intentional:

**Async** (must be `await`-ed):

| Method | Why async |
|---|---|
| `set()` | May need to run AES-GCM encryption |
| `get()` | May need to run AES-GCM decryption |
| `all()` | Calls `get()` for every key |

**Sync** (no `await` needed):

| Method | Notes |
|---|---|
| `remove()` | Raw `localStorage.removeItem` |
| `clear()` | Raw `localStorage.removeItem` in a loop |
| `has()` | Raw `localStorage.getItem` check |
| `keys()` | Iterates `localStorage` |
| `count()` | Calls `keys().length` |
| `getSize()` | Iterates `localStorage` for byte count |
| `getUsage()` | Math on `getSize()` |
| `getRemainingSpace()` | Math on `getSize()` |
| `getInfo()` | Reads and parses a single item |
| `cleanup()` | Calls `remove()` in a loop |

> Even without encryption enabled, `set()` and `get()` remain async so that adding encryption later is a non-breaking change.

---

## Type Preservation

Persista fully round-trips these types through `localStorage`:

```js
await storage.set('num',  42);
await storage.set('bool', true);
await storage.set('obj',  { nested: { value: 1 } });
await storage.set('arr',  [1, 'two', { three: 3 }]);
await storage.set('date', new Date());
await storage.set('map',  new Map([['a', 1], ['b', 2]]));
await storage.set('set',  new Set([1, 2, 3]));

// All come back as their original types
const map = await storage.get('map');  // instanceof Map ✅
const set = await storage.get('set');  // instanceof Set ✅
const d   = await storage.get('date'); // instanceof Date ✅
```

`Map` and `Set` are serialised to a tagged object format internally so they survive `JSON.stringify` → `JSON.parse`. This is handled automatically — no extra steps required.

---

## Encryption

Persista uses **AES-GCM 256-bit** encryption via the browser's built-in Web Crypto API. No external crypto libraries are needed.

### Enable for all writes

```js
const storage = new Persista({
  prefix: 'vault',
  encryption: { key: 'a-long-secret-key-you-should-keep-safe' }
});

await storage.set('creditCard', '4111-1111-1111-1111');
// Raw localStorage value is base64 ciphertext — unreadable without the key
```

### Disable encryption for a single item

```js
await storage.set('publicConfig', { theme: 'dark' }, { encrypt: false });
```

### How it works

Each encrypted item has a **fresh random salt (16 bytes) and IV (12 bytes)** generated at write time. This means:

- Two writes of the same value produce completely different ciphertexts.
- Even if an attacker captures the ciphertext, they cannot determine the original value without the key.
- The key itself is never stored — it lives only in your JavaScript and is used to derive the actual AES key via PBKDF2 (100,000 iterations, SHA-256).

### Notes

- Changing the encryption key means existing items can no longer be decrypted. Plan key rotation carefully.
- If the Web Crypto API is unavailable (non-HTTPS, very old browser), Persista falls back to plain storage and logs a warning in debug mode.

---

## Expiration (TTL)

Pass `expires` in milliseconds to `set()`:

```js
// Expires in 30 minutes
await storage.set('session', data, { expires: 30 * 60 * 1000 });

// Expires in 1 hour
await storage.set('cache', response, { expires: 3_600_000 });
```

When `get()` is called on an expired item:

1. The item is deleted from `localStorage`.
2. The `'expired'` event is fired.
3. `null` (or your `defaultValue`) is returned.

Items are not proactively scanned — expiry is checked lazily on access. Use `cleanup({ removeExpired: true })` to purge expired items without reading them.

---

## Events

```js
// 'set' — fired after every successful write
storage.on('set', (key, value, options) => {
  console.log(`Stored "${key}"`);
});

// 'remove' — fired when a key is explicitly removed
storage.on('remove', (key, previousValue) => {
  console.log(`Removed "${key}", had value:`, previousValue);
});

// 'clear' — fired when the entire instance is cleared
storage.on('clear', (removedKeys) => {
  console.log(`Cleared ${removedKeys.length} keys`);
});

// 'expired' — fired when a TTL item is detected as expired during get()
storage.on('expired', (key, rawStoredValue) => {
  console.log(`"${key}" expired and was removed`);
});
```

---

## Storage Monitoring

```js
const storage = new Persista({ prefix: 'app' });

// Total bytes used by this instance
const bytes = storage.getSize();
console.log(`Using ${bytes} bytes`);

// Percentage of the 5 MB default quota
const pct = storage.getUsage();
console.log(`${pct.toFixed(2)}% full`);

// Warn before quota is exceeded
if (storage.getUsage() > 80) {
  console.warn('Storage is over 80% — consider cleanup');
}

// Remaining bytes
const remaining = storage.getRemainingSpace();
console.log(`${remaining} bytes remaining`);

// Inspect a specific item
const info = storage.getInfo('user');
console.log(info);
// {
//   key:        'user',
//   size:       1024,
//   created:    1713000000000,
//   expires:    null,
//   valueType:  'object',
//   hasExpired: false
// }
```

---

## Smart Cleanup

```js
// Remove only expired items (default)
const removed = storage.cleanup();
console.log(`Removed ${removed} expired items`);

// Remove items older than 7 days
storage.cleanup({ olderThan: 7 * 24 * 60 * 60 * 1000 });

// Keep only the 100 most recently written items
storage.cleanup({ keep: 100 });

// Kitchen-sink cleanup before the user might hit quota
storage.cleanup({
  removeExpired: true,
  olderThan:     30 * 24 * 60 * 60 * 1000, // older than 30 days
  keep:          200                         // hard cap at 200 items
});
```

---

## Error Handling

Persista throws typed errors you can catch:

```js
import Persista, { QuotaExceededError, StorageError } from 'persista';

try {
  await storage.set('key', hugePayload);
} catch (err) {
  if (err instanceof QuotaExceededError) {
    // localStorage quota exceeded — run cleanup or alert the user
    storage.cleanup({ removeExpired: true, olderThan: 7 * 24 * 60 * 60 * 1000 });
  } else if (err instanceof StorageError) {
    console.error('Storage error:', err.message);
  }
}
```

| Error class | When thrown |
|---|---|
| `QuotaExceededError` | `localStorage` quota is exceeded on `set()` |
| `StorageError` | Any other localStorage or encryption failure |

---

## TypeScript

Types are bundled. Import like any other module:

```ts
import Persista, { PersistaOptions, SetOptions, ItemInfo } from 'persista';

const storage = new Persista({ prefix: 'app' });

// Generic type parameter for get()
const user = await storage.get<{ name: string; role: string }>('user');
user?.name; // typed as string | undefined
```

---

## Changelog

### [0.2.0]

- **Added** AES-GCM encryption (`encryption.key` option, per-item `encrypt` override)
- **Added** Storage monitoring: `getSize()`, `getUsage()`, `getRemainingSpace()`
- **Added** Item metadata: `getInfo()` with creation time, expiry, size, type
- **Added** Smart cleanup: `cleanup()` with age, count, and expiry rules
- **Added** Full `Map`, `Set`, and `Date` round-trip preservation through `localStorage`
- **Changed** `set()` and `get()` are now `async` (required for encryption support)
- **Changed** `all()` is now `async`
- **Fixed** `clear()` no longer makes two separate passes over `localStorage`
- **Fixed** Salt encoding bug in AES-GCM key derivation

### [0.1.0]

- Initial release
- Basic CRUD with type preservation
- Expiration (TTL) support
- Event system (`on`, `off`)
- Key prefixing
- Debug mode