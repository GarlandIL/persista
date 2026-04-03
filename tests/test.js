// tests/test.js
import Persista from '../src/core/storage';

describe('Persista basic', () => {
  let storage;

  beforeEach(() => {
    storage = new Persista({ prefix: 'test' });
    storage.clear();
  });

  // FIX #3: set() and get() are async — must be awaited or the assertions
  // run before the Promise resolves, producing false-green results.

  test('set and get', async () => {
    await storage.set('foo', 'bar');
    expect(await storage.get('foo')).toBe('bar');
  });

  test('type preservation - number', async () => {
    await storage.set('num', 42);
    expect(await storage.get('num')).toBe(42);
  });

  test('type preservation - boolean', async () => {
    await storage.set('flag', true);
    expect(await storage.get('flag')).toBe(true);
  });

  test('type preservation - object', async () => {
    await storage.set('obj', { a: 1, b: 'two' });
    expect(await storage.get('obj')).toEqual({ a: 1, b: 'two' });
  });

  test('type preservation - array', async () => {
    await storage.set('arr', [1, 'two', true]);
    expect(await storage.get('arr')).toEqual([1, 'two', true]);
  });

  test('type preservation - Date', async () => {
    const d = new Date('2024-01-01T00:00:00.000Z');
    await storage.set('date', d);
    const result = await storage.get('date');
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe(d.toISOString());
  });

  test('type preservation - Map', async () => {
    const m = new Map([['a', 1], ['b', 2]]);
    await storage.set('map', m);
    const result = await storage.get('map');
    expect(result).toBeInstanceOf(Map);
    expect(result.get('a')).toBe(1);
    expect(result.get('b')).toBe(2);
  });

  test('type preservation - Set', async () => {
    const s = new Set([1, 2, 3]);
    await storage.set('set', s);
    const result = await storage.get('set');
    expect(result).toBeInstanceOf(Set);
    expect(result.has(1)).toBe(true);
    expect(result.has(3)).toBe(true);
  });

  test('remove', async () => {
    await storage.set('foo', 'bar');
    storage.remove('foo');
    expect(await storage.get('foo')).toBeNull();
  });

  test('get returns defaultValue for missing key', async () => {
    expect(await storage.get('nope', 'fallback')).toBe('fallback');
  });

  test('has() returns true for existing key', async () => {
    await storage.set('x', 1);
    expect(storage.has('x')).toBe(true);
  });

  test('has() returns false for missing key', () => {
    expect(storage.has('ghost')).toBe(false);
  });

  test('hasValid() returns false for expired key', async () => {
    await storage.set('temp', 'x', { expires: 30 });
    await new Promise(r => setTimeout(r, 60));
    expect(await storage.hasValid('temp')).toBe(false);
  });

  test('count() tracks number of keys', async () => {
    await storage.set('a', 1);
    await storage.set('b', 2);
    expect(storage.count()).toBe(2);
    storage.remove('a');
    expect(storage.count()).toBe(1);
  });

  test('keys() returns unprefixed keys', async () => {
    await storage.set('p', 1);
    await storage.set('q', 2);
    expect(storage.keys()).toEqual(expect.arrayContaining(['p', 'q']));
  });

  test('all() returns all key-value pairs', async () => {
    await storage.set('m', 1);
    await storage.set('n', 2);
    const all = await storage.all();
    expect(all).toMatchObject({ m: 1, n: 2 });
  });

  test('clear() removes all instance keys', async () => {
    await storage.set('a', 1);
    await storage.set('b', 2);
    storage.clear();
    expect(storage.count()).toBe(0);
  });
});