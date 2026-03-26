import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAccountViaGraphql } from '../lib/sideshiftAccount.js';

describe('createAccountViaGraphql', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns id and secret from GraphQL data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        text: async () =>
          JSON.stringify({
            data: { createAccount: { id: 'abc123', secret: 'secret-xyz' } },
          }),
      })),
    );

    await expect(createAccountViaGraphql()).resolves.toEqual({
      affiliateId: 'abc123',
      secret: 'secret-xyz',
    });
  });

  it('throws on GraphQL errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        text: async () =>
          JSON.stringify({
            errors: [{ message: 'rate limited' }],
          }),
      })),
    );

    await expect(createAccountViaGraphql()).rejects.toThrow('rate limited');
  });

  it('throws when payload is missing fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        text: async () => JSON.stringify({ data: { createAccount: {} } }),
      })),
    );

    await expect(createAccountViaGraphql()).rejects.toThrow('did not return');
  });
});
