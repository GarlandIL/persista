// src/core/utils.js

/**
 * Safely parse JSON, returning fallback on error.
 */
export function safeParse(json, fallback = null) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

/**
 * Check if a value is a plain object.
 */
export function isPlainObject(obj) {
  return Object.prototype.toString.call(obj) === '[object Object]';
}

// ─── Map / Set serialisation ──────────────────────────────────────────────────
//
// JSON.stringify(new Map()) → "{}"  and  JSON.stringify(new Set()) → "[]"
// Both silently lose all data. We use tagged wrapper objects instead so the
// round-trip through localStorage is lossless.
//
// Wire format:
//   Map  → { __type: '__persista_map__', entries: [[k,v], ...] }
//   Set  → { __type: '__persista_set__', values:  [v, ...]      }

const MAP_TAG  = '__persista_map__';
const SET_TAG  = '__persista_set__';
const DATE_TAG = '__persista_date__';

/**
 * Prepare a value for JSON.stringify, preserving Map, Set, and Date instances.
 */
export function serialize(value) {
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
  return value; // primitives
}

/**
 * Restore a value that was prepared with serialize().
 */
export function deserialize(value) {
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
 * Deep-clone a value in memory (does not go through JSON).
 */
export function deepClone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value);
  if (value instanceof Map)  return new Map([...value.entries()].map(([k, v]) => [deepClone(k), deepClone(v)]));
  if (value instanceof Set)  return new Set([...value.values()].map(deepClone));
  if (Array.isArray(value))  return value.map(deepClone);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, deepClone(v)])
    );
  }
  return value;
}

/**
 * Derive a human-readable value type string that survives encryption.
 * Called before encryption so the type can be stored in the item envelope.
 *
 * FIX #2: valueType is computed BEFORE encryption and stored separately so
 * getInfo() always reports the original type, not 'string' (the ciphertext type).
 *
 * @param {any} value
 * @returns {string}
 */
export function getValueType(value) {
  if (value === null)       return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Map) return 'map';
  if (value instanceof Set) return 'set';
  if (value instanceof Date) return 'date';
  return typeof value;
}