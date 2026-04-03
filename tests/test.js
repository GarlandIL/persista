import Persista from '../src/core/storage';

describe('Persista basic', () => {
  let storage;

  beforeEach(() => {
    storage = new Persista({ prefix: 'test' });
    storage.clear();
  });

  test('set and get', () => {
    storage.set('foo', 'bar');
    expect(storage.get('foo')).toBe('bar');
  });

  test('type preservation', () => {
    storage.set('num', 42);
    expect(storage.get('num')).toBe(42);
  });

  test('remove', () => {
    storage.set('foo', 'bar');
    storage.remove('foo');
    expect(storage.get('foo')).toBeNull();
  });
});