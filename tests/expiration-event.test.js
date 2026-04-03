// tests/expiration-event.test.js
import Persista from '../src/core/storage';

describe('Persista - Expiration & Events', () => {
  let storage;

  beforeEach(() => {
    storage = new Persista({ prefix: 'test', debug: false });
    storage.clear();
  });

  //  Expiration 

  test('item is available before TTL expires', async () => {
    await storage.set('temp', 'will expire', { expires: 200 });
    expect(await storage.get('temp')).toBe('will expire');
  });

  test('item returns null after TTL expires', async () => {
    await storage.set('temp', 'will expire', { expires: 50 });

    await new Promise(resolve => setTimeout(resolve, 100));
    expect(await storage.get('temp')).toBeNull();
  });

  test('expired item is removed from localStorage', async () => {
    await storage.set('temp', 'x', { expires: 50 });

    await new Promise(resolve => setTimeout(resolve, 100));
    // Trigger expiry check
    await storage.get('temp');
    expect(storage.has('temp')).toBe(false);
  });

  test('non-expiring item survives beyond TTL window', async () => {
    await storage.set('permanent', 'stays');

    await new Promise(resolve => setTimeout(resolve, 100));
    expect(await storage.get('permanent')).toBe('stays');
  });

  //  Events 

  // Fix #1: set() is async — must be awaited before asserting the mock
  test('emits "set" event with key, value, options', async () => {
    const mock = jest.fn();
    storage.on('set', mock);
    await storage.set('foo', 'bar');
    expect(mock).toHaveBeenCalledWith('foo', 'bar', {});
  });

  test('emits "set" event with options when provided', async () => {
    const mock = jest.fn();
    storage.on('set', mock);
    await storage.set('foo', 'bar', { expires: 1000 });
    expect(mock).toHaveBeenCalledWith('foo', 'bar', { expires: 1000 });
  });

  test('emits "expired" event when item TTL is exceeded', done => {
    const mock = jest.fn();
    storage.on('expired', mock);

    storage.set('temp', 'data', { expires: 30 }).then(() => {
      setTimeout(async () => {
        await storage.get('temp'); // triggers the expiry check
        expect(mock).toHaveBeenCalledWith('temp', expect.anything());
        done();
      }, 80);
    });
  });

  test('emits "remove" event with key and previous value', async () => {
    const mock = jest.fn();
    storage.on('remove', mock);
    await storage.set('toRemove', 'value');
    storage.remove('toRemove');
    expect(mock).toHaveBeenCalledWith('toRemove', 'value');
  });

  test('emits "clear" event with array of removed keys', async () => {
    const mock = jest.fn();
    storage.on('clear', mock);
    await storage.set('a', 1);
    await storage.set('b', 2);
    storage.clear();
    expect(mock).toHaveBeenCalled();
    const keysArg = mock.mock.calls[0][0];
    expect(keysArg).toEqual(expect.arrayContaining(['a', 'b']));
  });

  //  Event listener management 

  test('off() removes a specific listener', async () => {
    const mock = jest.fn();
    storage.on('set', mock);
    storage.off('set', mock);
    await storage.set('x', 1);
    expect(mock).not.toHaveBeenCalled();
  });

  test('off() with no callback removes all listeners for that event', async () => {
    const mock1 = jest.fn();
    const mock2 = jest.fn();
    storage.on('set', mock1);
    storage.on('set', mock2);
    storage.off('set');
    await storage.set('x', 1);
    expect(mock1).not.toHaveBeenCalled();
    expect(mock2).not.toHaveBeenCalled();
  });

  test('on() supports chaining', () => {
    const result = storage.on('set', jest.fn()).on('remove', jest.fn());
    expect(result).toBe(storage);
  });
});