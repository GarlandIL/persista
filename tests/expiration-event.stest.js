import Persista from '../src/core/storage';

describe('Persista - Expiration & Events', () => {
  let storage;

  beforeEach(() => {
    storage = new Persista({ prefix: 'test', debug: false });
    storage.clear();
  });

  test('expires after given time', (done) => {
    storage.set('temp', 'will expire', { expires: 50 }); // 50ms
    expect(storage.get('temp')).toBe('will expire');
    
    setTimeout(() => {
      expect(storage.get('temp')).toBeNull();
      done();
    }, 100);
  });

  test('expired item is removed from storage', (done) => {
    storage.set('temp', 'x', { expires: 50 });
    setTimeout(() => {
      expect(storage.has('temp')).toBe(false);
      done();
    }, 100);
  });

  test('emits "set" event', () => {
    const mock = jest.fn();
    storage.on('set', mock);
    storage.set('foo', 'bar');
    expect(mock).toHaveBeenCalledWith('foo', 'bar', {});
  });

  test('emits "expired" event', (done) => {
    const mock = jest.fn();
    storage.on('expired', mock);
    storage.set('temp', 'data', { expires: 20 });
    
    setTimeout(() => {
      expect(mock).toHaveBeenCalledWith('temp', 'data');
      done();
    }, 50);
  });

  test('emits "remove" event', () => {
    const mock = jest.fn();
    storage.on('remove', mock);
    storage.set('toRemove', 'value');
    storage.remove('toRemove');
    expect(mock).toHaveBeenCalledWith('toRemove', 'value');
  });

  test('emits "clear" event', () => {
    const mock = jest.fn();
    storage.on('clear', mock);
    storage.set('a', 1);
    storage.set('b', 2);
    storage.clear();
    expect(mock).toHaveBeenCalled();
    const keysArg = mock.mock.calls[0][0];
    expect(keysArg).toEqual(expect.arrayContaining(['a', 'b']));
  });
});