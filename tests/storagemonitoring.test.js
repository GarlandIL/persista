// tests/storagemonitoring.test.js
import Persista from '../src/core/storage';

describe('Persista - Monitoring & Cleanup', () => {
  let storage;

  beforeEach(() => {
    storage = new Persista({ prefix: 'monitor_test' });
    storage.clear();
  });

  //  getSize 

  test('getSize() returns a positive number after storing data', async () => {
    await storage.set('a', 'x');
    const size = storage.getSize();
    expect(typeof size).toBe('number');
    expect(size).toBeGreaterThan(0);
  });

  test('getSize() grows when more data is added', async () => {
    await storage.set('small', 'x');
    const before = storage.getSize();
    await storage.set('large', 'x'.repeat(1000));
    expect(storage.getSize()).toBeGreaterThan(before);
  });

  //  getUsage 

  test('getUsage() returns percentage between 0 and 100', async () => {
    await storage.set('b', 'y');
    const usage = storage.getUsage();
    expect(usage).toBeGreaterThan(0);
    expect(usage).toBeLessThan(100);
  });

  test('getUsage() accepts a custom quota', async () => {
    await storage.set('b', 'y');
    // With a tiny quota the usage should be very high
    const usage = storage.getUsage(100);
    expect(usage).toBeGreaterThan(0);
  });

  //  getRemainingSpace 

  test('getRemainingSpace() returns a positive number', () => {
    const remaining = storage.getRemainingSpace();
    expect(remaining).toBeGreaterThan(0);
  });

  test('getRemainingSpace() decreases as data is added', async () => {
    const before = storage.getRemainingSpace();
    await storage.set('fill', 'x'.repeat(500));
    expect(storage.getRemainingSpace()).toBeLessThan(before);
  });

  //  getInfo 

  test('getInfo() returns correct metadata shape', async () => {
    await storage.set('test', 'hello', { expires: 1000 });
    const info = storage.getInfo('test');
    expect(info).toMatchObject({
      key:        'test',
      valueType:  'string',
      hasExpired: false
    });
    expect(typeof info.size).toBe('number');
    expect(info.size).toBeGreaterThan(0);
    expect(info.created).toBeLessThanOrEqual(Date.now());
    expect(typeof info.expires).toBe('number'); // absolute timestamp
  });

  test('getInfo() returns null for a missing key', () => {
    expect(storage.getInfo('ghost')).toBeNull();
  });

  test('getInfo() hasExpired is true after TTL', async () => {
    await storage.set('short', 'x', { expires: 30 });
    await new Promise(resolve => setTimeout(resolve, 60));
    const info = storage.getInfo('short');
    expect(info.hasExpired).toBe(true);
  });

  //  cleanup 

  test('cleanup({ removeExpired }) removes expired items only', async () => {
    await storage.set('temp', 'expire soon', { expires: 50 });
    await storage.set('keep', 'forever');

    await new Promise(resolve => setTimeout(resolve, 100));
    const removed = storage.cleanup({ removeExpired: true });
    expect(removed).toBe(1);
    expect(storage.has('temp')).toBe(false);
    expect(storage.has('keep')).toBe(true);
  });

  test('cleanup({ olderThan }) removes items older than threshold', async () => {
    await storage.set('old', 'old data');

    // Manually backdate the timestamp so it appears old
    const fullKey = storage._getFullKey('old');
    const raw  = localStorage.getItem(fullKey);
    const item = JSON.parse(raw);
    item.timestamp = Date.now() - 20000; // 20 seconds ago
    localStorage.setItem(fullKey, JSON.stringify(item));

    await storage.set('new', 'new data');

    const removed = storage.cleanup({ olderThan: 10000, removeExpired: false });
    expect(removed).toBe(1);
    expect(storage.has('old')).toBe(false);
    expect(storage.has('new')).toBe(true);
  });

  test('cleanup({ keep: N }) retains only N newest items', async () => {
    for (let i = 1; i <= 5; i++) {
      await storage.set(`item${i}`, i);
    }
    storage.cleanup({ keep: 3, removeExpired: false });
    expect(storage.count()).toBe(3);
  });

  test('cleanup returns 0 when nothing matches', async () => {
    await storage.set('a', 1);
    await storage.set('b', 2);
    // Nothing is expired or old
    expect(storage.cleanup({ removeExpired: true })).toBe(0);
  });
});