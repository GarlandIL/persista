// src/index.js
import Persista from './core/storage';

// FIX #4: export named error classes so callers can do:
//   import Persista, { QuotaExceededError, StorageError } from 'persista';
export { StorageError, QuotaExceededError, ValidationError } from './core/errors';

export default Persista;