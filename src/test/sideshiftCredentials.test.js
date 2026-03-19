import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearStoredCredentials,
  getStoredCredentials,
  hasStoredCredentials,
  saveCredentials,
} from '../lib/sideshiftCredentials.js';

describe('sideshiftCredentials', () => {
  const store = new Map();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal(
      'localStorage',
      {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => {
          store.set(k, v);
        },
        removeItem: (k) => {
          store.delete(k);
        },
      },
      { replace: true },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips credentials', () => {
    saveCredentials(' secret-one ', ' id-one ');
    expect(getStoredCredentials()).toEqual({ secret: 'secret-one', affiliateId: 'id-one' });
    expect(hasStoredCredentials()).toBe(true);
  });

  it('clears credentials', () => {
    saveCredentials('a', 'b');
    clearStoredCredentials();
    expect(getStoredCredentials()).toBe(null);
    expect(hasStoredCredentials()).toBe(false);
  });

  it('rejects empty save', () => {
    expect(() => saveCredentials('', 'b')).toThrow('required');
  });
});
