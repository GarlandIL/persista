export interface PersistaOptions {
  prefix?: string;
  separator?: string;
  debug?: boolean;
  encryption?: {
    key: string;
  };
}

export interface SetOptions {
  expires?: number | null;
  encrypt?: boolean;
}

export interface CleanupOptions {
  olderThan?: number | null;
  keep?: number | null;
  removeExpired?: boolean;
}

export interface ItemInfo {
  key: string;
  size: number;
  created: number;
  expires: number | null;
  valueType: string;
  hasExpired: boolean;
}

export type EventName = 'set' | 'get' | 'remove' | 'clear' | 'expired';

export class StorageError extends Error {
  constructor(message: string);
}

export class QuotaExceededError extends StorageError {
  constructor(message?: string);
}

export class ValidationError extends StorageError {
  constructor(message: string);
}

export default class Persista {
  constructor(options?: PersistaOptions);
  
  // Core methods
  set<T = any>(key: string, value: T, options?: SetOptions): Promise<boolean>;
  get<T = any>(key: string, defaultValue?: T | null): Promise<T | null>;
  remove(key: string): boolean;
  clear(): boolean;
  has(key: string): boolean;
  hasValid(key: string): Promise<boolean>;
  
  // Query methods
  keys(): string[];
  all(): Promise<Record<string, any>>;
  count(): number;
  
  // Monitoring methods
  getSize(): number;
  size(): number; // deprecated
  getUsage(quotaMax?: number): number;
  getRemainingSpace(quotaMax?: number): number;
  getInfo(key: string): ItemInfo | null;
  cleanup(options?: CleanupOptions): number;
  
  // Event methods
  on(event: EventName, callback: (...args: any[]) => void): this;
  off(event: EventName, callback?: (...args: any[]) => void): this;
}