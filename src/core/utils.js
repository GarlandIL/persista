export function safeParse(json, fallback = null) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

export function isPlainObject(obj) {
  return Object.prototype.toString.call(obj) === '[object Object]';
}

const MAP_TAG  = '__persista_map__';
const SET_TAG  = '__persista_set__';
const DATE_TAG = '__persista_date__';

/**
 * Serialize Map, Set, and Date instances to JSON-compatible format.
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
  return value;
}

/**
 * Deserialize Map, Set, and Date instances.
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
 * Deep clone value.
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
 * Get string representation of value type.
 */
export function getValueType(value) {
  if (value === null)       return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Map) return 'map';
  if (value instanceof Set) return 'set';
  if (value instanceof Date) return 'date';
  return typeof value;
}