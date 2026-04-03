// tests/encryption.test.js
import Persista from '../src/core/storage';

describe('Persista - Encryption', () => {
  let storage;
  const testKey = 'my-test-encryption-key-32-chars!'; // ≥ 32 chars recommended

  beforeEach(async () => {
    storage = new Persista({
      prefix: 'encrypt_test',
      encryption: { key: testKey }
    });
    storage.clear();
  });

  //  Basic encrypt / decrypt round-trip 

  test('encrypts data at rest and decrypts on get', async () => {
    const original = { ssn: '123-45-6789', creditCard: '4111-1111-1111-1111' };
    await storage.set('sensitive', original);

    // Raw value in localStorage must not be readable plain text
    const raw    = localStorage.getItem('encrypt_test:sensitive');
    const parsed = JSON.parse(raw);
    expect(parsed.encrypted).toBe(true);
    expect(typeof parsed.value).toBe('string');              // base64 ciphertext
    expect(parsed.value).not.toContain('123-45-6789');       // no plain SSN
    expect(parsed.value).not.toContain('creditCard');        // no plain keys

    // get() must transparently decrypt back to the original
    const retrieved = await storage.get('sensitive');
    expect(retrieved).toEqual(original);
  });

  test('encrypts strings', async () => {
    await storage.set('secret', 'top secret string');
    const raw = JSON.parse(localStorage.getItem('encrypt_test:secret'));
    expect(raw.encrypted).toBe(true);
    expect(await storage.get('secret')).toBe('top secret string');
  });

  test('encrypts numbers', async () => {
    await storage.set('pin', 1234);
    expect(await storage.get('pin')).toBe(1234);
  });

  test('encrypts arrays', async () => {
    const arr = [1, 'two', { three: 3 }];
    await storage.set('arr', arr);
    expect(await storage.get('arr')).toEqual(arr);
  });

  //  Per-operation opt-out 

  test('encrypt:false stores value as plain text even with encryption enabled', async () => {
    await storage.set('public', 'visible data', { encrypt: false });
    const raw    = localStorage.getItem('encrypt_test:public');
    const parsed = JSON.parse(raw);
    expect(parsed.encrypted).toBe(false);
    expect(parsed.value).toBe('visible data');
  });

  //  Interaction with expiration 

  test('encrypted item with TTL is accessible before expiry', async () => {
    await storage.set('tempSecret', 'will expire', { expires: 200, encrypt: true });
    expect(await storage.get('tempSecret')).toBe('will expire');
  });

  test('encrypted item returns null after TTL expires', async () => {
    await storage.set('tempSecret', 'will expire', { expires: 50, encrypt: true });

    await new Promise(resolve => setTimeout(resolve, 100));
    expect(await storage.get('tempSecret')).toBeNull();
  });

  //  Two ciphertexts for the same value differ (random IV / salt) 

  test('two set() calls for the same value produce different ciphertexts', async () => {
    await storage.set('k', 'same value');
    const first = JSON.parse(localStorage.getItem('encrypt_test:k')).value;

    await storage.set('k', 'same value');
    const second = JSON.parse(localStorage.getItem('encrypt_test:k')).value;

    // Different random salt + IV means ciphertexts should differ
    expect(first).not.toBe(second);
  });
});