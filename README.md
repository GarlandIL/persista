# Persista

A powerful localStorage wrapper with expiration, encryption, events, and more.

## Installation

```bash
npm install persista

## Storage Monitoring

```javascript
const storage = new Persista({ prefix: 'myapp' });

// Check usage
console.log(storage.getSize());       // 24576 bytes
console.log(storage.getUsage());      // 0.46% of 5MB
console.log(storage.getRemainingSpace()); // 5218304 bytes

// Inspect an item
storage.getInfo('user');
// {
//   key: 'user',
//   size: 1024,
//   created: 1634567890123,
//   expires: 1634571490123,
//   valueType: 'object',
//   hasExpired: false
// }

// Auto-cleanup old data
storage.cleanup({
  olderThan: 7 * 24 * 60 * 60 * 1000, // 7 days
  keep: 100,                           // keep 100 newest
  removeExpired: true
});

---

### **What you've achieved now**

- ✅ Full visibility into storage usage  
- ✅ Ability to warn users before quota exceeded  
- ✅ Smart cleanup to prevent filling up storage  
- ✅ Item-level metadata for debugging  

**Next possible steps** (choose one when ready):  
- **Encryption** – store sensitive data securely  
- **Schema validation** – ensure data integrity  
- **Batch operations** – set/get multiple keys at once  
- **Compression** – save space for large objects  

