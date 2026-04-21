import { afterEach, describe, expect, it, vi } from 'vitest';

import { enrichSideshiftAmountErrorMessage, fetchCreateShiftPermission } from '../lib/sideshift.js';

describe('enrichSideshiftAmountErrorMessage', () => {
  const btcPayment = { currencyCode: 'BTC' };

  it('appends BCH to minimum deposit errors with a bare number', () => {
    expect(
      enrichSideshiftAmountErrorMessage(
        'Amount too low. Minimum deposit amount: 0.00012345',
        btcPayment,
      ),
    ).toBe('Amount too low. Minimum deposit amount: 0.00012345 BCH');
  });

  it('drops a trailing period after the amount before appending BCH', () => {
    expect(
      enrichSideshiftAmountErrorMessage(
        'Amount too low. Minimum deposit amount: 0.01056636.',
        btcPayment,
      ),
    ).toBe('Amount too low. Minimum deposit amount: 0.01056636 BCH');
  });

  it('appends BCH to maximum deposit errors with a bare number', () => {
    expect(
      enrichSideshiftAmountErrorMessage(
        'Amount too high. Maximum deposit amount: 12',
        btcPayment,
      ),
    ).toBe('Amount too high. Maximum deposit amount: 12 BCH');
  });

  it('does not append BCH when the message already names BCH', () => {
    const msg = 'Amount too low. Minimum deposit amount: 0.001 BCH';
    expect(enrichSideshiftAmountErrorMessage(msg, btcPayment)).toBe(msg);
  });

  it('returns the original message when payment currency is unknown', () => {
    const msg = 'Amount too low. Minimum deposit amount: 1';
    expect(enrichSideshiftAmountErrorMessage(msg, null)).toBe(msg);
  });
});

describe('fetchCreateShiftPermission', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns createShift from a 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        text: async () => JSON.stringify({ createShift: true }),
      })),
    );

    await expect(fetchCreateShiftPermission('secret-one')).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'https://sideshift.ai/api/v2/permissions',
      expect.objectContaining({
        method: 'GET',
        headers: { 'x-sideshift-secret': 'secret-one' },
      }),
    );
  });

  it('throws when secret is missing', async () => {
    await expect(fetchCreateShiftPermission('')).rejects.toThrow('missing');
  });

  it('throws when response omits createShift', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        text: async () => JSON.stringify({}),
      })),
    );

    await expect(fetchCreateShiftPermission('s')).rejects.toThrow('createShift');
  });
});
