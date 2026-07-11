import Persista, { ValidationError } from '../src/index';

describe('Persista - Validation & Edge Cases', () => {
  let storage;

  beforeEach(() => {
    storage = new Persista({ prefix: 'validation_test' });
    storage.clear();
  });

  // Constructor validations
  test('throws ValidationError on invalid prefix type', () => {
    expect(() => new Persista({ prefix: 123 })).toThrow(ValidationError);
  });

  test('throws ValidationError on invalid separator type', () => {
    expect(() => new Persista({ separator: true })).toThrow(ValidationError);
  });

  test('throws ValidationError on invalid encryption configuration', () => {
    expect(() => new Persista({ encryption: 'invalid-key-shape' })).toThrow(ValidationError);
    expect(() => new Persista({ encryption: { key: '' } })).toThrow(ValidationError);
    expect(() => new Persista({ encryption: { key: 123 } })).toThrow(ValidationError);
  });

  // Method key validations
  test('throws ValidationError when key is not a string or is empty', async () => {
    const invalidKeys = [null, undefined, 123, {}, [], ''];
    for (const key of invalidKeys) {
      await expect(storage.set(key, 'val')).rejects.toThrow(ValidationError);
      await expect(storage.get(key)).rejects.toThrow(ValidationError);
      expect(() => storage.remove(key)).toThrow(ValidationError);
      expect(() => storage.has(key)).toThrow(ValidationError);
      await expect(storage.hasValid(key)).rejects.toThrow(ValidationError);
      expect(() => storage.getInfo(key)).toThrow(ValidationError);
    }
  });

  // Expiration validations
  test('throws ValidationError on invalid expiration parameter', async () => {
    await expect(storage.set('k', 'v', { expires: -50 })).rejects.toThrow(ValidationError);
    await expect(storage.set('k', 'v', { expires: '1000' })).rejects.toThrow(ValidationError);
  });

  // Cleanup validations
  test('throws ValidationError on invalid cleanup parameters', () => {
    expect(() => storage.cleanup({ olderThan: -100 })).toThrow(ValidationError);
    expect(() => storage.cleanup({ olderThan: '100' })).toThrow(ValidationError);
    expect(() => storage.cleanup({ keep: -5 })).toThrow(ValidationError);
    expect(() => storage.cleanup({ keep: 5.5 })).toThrow(ValidationError);
    expect(() => storage.cleanup({ removeExpired: 'true' })).toThrow(ValidationError);
  });

  // Event validations
  test('throws ValidationError on invalid event parameters', () => {
    expect(() => storage.on(123, () => {})).toThrow(ValidationError);
    expect(() => storage.on('set', 'not-a-function')).toThrow(ValidationError);
    expect(() => storage.off(123)).toThrow(ValidationError);
    expect(() => storage.off('set', 'not-a-function')).toThrow(ValidationError);
  });

  // hasValid bug fix
  test('hasValid() returns true for non-expired keys with literal null values', async () => {
    await storage.set('null_key', null);
    expect(await storage.hasValid('null_key')).toBe(true);

    const info = storage.getInfo('null_key');
    expect(info.valueType).toBe('null');
  });

  // Stack safe encryption / decryption with large payload
  test('encrypts and decrypts large payload (>100KB) without call stack error', async () => {
    const secureStorage = new Persista({
      prefix: 'secure_large_test',
      encryption: { key: 'my-super-secret-key-32-chars-long!' }
    });
    secureStorage.clear();

    const largeData = {
      nested: {
        text: 'A'.repeat(120000) // 120KB string
      }
    };

    await secureStorage.set('large', largeData);
    const retrieved = await secureStorage.get('large');
    expect(retrieved).toEqual(largeData);
  });
});
