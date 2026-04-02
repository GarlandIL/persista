// src/core/errors.js
export class StorageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StorageError';
  }
}

export class QuotaExceededError extends StorageError {
  constructor(message = 'Storage quota exceeded') {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

export class ValidationError extends StorageError {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}