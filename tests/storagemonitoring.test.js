import Persista from '../src/core/storage';

describe('Persista - Monitoring & Cleanup', () => {
  let storage;

  beforeEach(() => {
    storage = new Persista({ prefix: 'monitor_test' });
    storage.clear();
  });

  test('getSize returns bytes', () => {
    storage.set('a', 'x'); // small string
    const size = storage.getSize();
    expect(size).toBeGreaterThan(0);
    expect(typeof size).toBe('number');
  });

  test('getUsage returns percentage', () => {
    storage.set('b', 'y');
    const usage = storage.getUsage();
    expect(usage).toBeGreaterThan(0);
    expect(usage).toBeLessThan(100);
  });

  test('getRemainingSpace returns positive number', () => {
    const remaining = storage.getRemainingSpace();
    expect(remaining).toBeGreaterThan(0);
  });

  test('getInfo returns metadata', () => {
    storage.set('test', 'hello', { expires: 1000 });
    const info = storage.getInfo('test');
    expect(info).toMatchObject({
      key: 'test',
      valueType: 'string',
      hasExpired: false
    });
    expect(info.size).toBeGreaterThan(0);
    expect(info.created).toBeLessThanOrEqual(Date.now());
  });

  test('cleanup removes expired items', (done) => {
    storage.set('temp', 'expire soon', { expires: 50 });
    storage.set('keep', 'forever');
    
    setTimeout(() => {
      const removed = storage.cleanup({ removeExpired: true });
      expect(removed).toBe(1);
      expect(storage.has('temp')).toBe(false);
      expect(storage.has('keep')).toBe(true);
      done();
    }, 100);
  });

  test('cleanup removes items olderThan', () => {
    // Mock timestamps by setting items with specific delays
    storage.set('old', 'old data');
    // Manually override timestamp in localStorage (hack for test)
    const fullKey = storage._getFullKey('old');
    const raw = localStorage.getItem(fullKey);
    const item = JSON.parse(raw);
    item.timestamp = Date.now() - 20000; // 20 seconds ago
    localStorage.setItem(fullKey, JSON.stringify(item));
    
    storage.set('new', 'new data');
    
    const removed = storage.cleanup({ olderThan: 10000 }); // older than 10 sec
    expect(removed).toBe(1);
    expect(storage.has('old')).toBe(false);
    expect(storage.has('new')).toBe(true);
  });

  test('cleanup keeps N newest items', () => {
    for (let i = 1; i <= 5; i++) {
      storage.set(`item${i}`, i);
    }
    // Simulate different timestamps by re-setting with delays (or just rely on order)
    const removed = storage.cleanup({ keep: 3 });
    // Should keep 3 newest, remove 2 oldest (based on creation order)
    expect(storage.count()).toBe(3);
  });
});