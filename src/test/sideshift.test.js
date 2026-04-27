import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createFixedBchShift,
  enrichSideshiftAmountErrorMessage,
  fetchCreateShiftPermission,
  fetchShiftsBulk,
} from '../lib/sideshift.js';

describe('enrichSideshiftAmountErrorMessage', () => {
  const btcPayment = { currencyCode: 'BTC' };

  it('appends BCH and USD estimate to minimum deposit errors with a bare number', () => {
    expect(
      enrichSideshiftAmountErrorMessage(
        'Amount too low. Minimum deposit amount: 0.00012345',
        btcPayment,
        { bchUsdRate: 400 },
      ),
    ).toBe('Amount too low. Minimum deposit amount: 0.00012345 BCH (~0.05 USD)');
  });

  it('drops a trailing period after the amount before appending BCH', () => {
    expect(
      enrichSideshiftAmountErrorMessage(
        'Amount too low. Minimum deposit amount: 0.01056636.',
        btcPayment,
      ),
    ).toBe('Amount too low. Minimum deposit amount: 0.01056636 BCH');
  });

  it('uses a less-than-cent USD estimate for tiny minimum deposit errors', () => {
    expect(
      enrichSideshiftAmountErrorMessage(
        'Amount too low. Minimum deposit amount: 0.000001',
        btcPayment,
        { bchUsdRate: 400 },
      ),
    ).toBe('Amount too low. Minimum deposit amount: 0.000001 BCH (~<0.01 USD)');
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

  it('returns createShift from a 200 response without sending a secret', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ createShift: true }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCreateShiftPermission()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sideshift.ai/api/v2/permissions',
      expect.objectContaining({ method: 'GET' }),
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toBeUndefined();
  });

  it('returns false for restricted IPs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        text: async () => JSON.stringify({ createShift: false }),
      })),
    );

    await expect(fetchCreateShiftPermission()).resolves.toBe(false);
  });

  it('throws when response omits createShift', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        text: async () => JSON.stringify({}),
      })),
    );

    await expect(fetchCreateShiftPermission()).rejects.toThrow('createShift');
  });
});

describe('createFixedBchShift', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends settleNetwork when the payment request targets a specific network', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'quote-1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'shift-1', depositAddress: 'bitcoincash:q', depositAmount: '0.1' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await createFixedBchShift(
      {
        address: 'el1qqd0exampleliquidaddress',
        amount: '0.42',
        methodId: 'btc',
        networkId: 'liquid',
      },
      { secret: 'secret', affiliateId: 'account' },
    );

    const [, quoteInit] = fetchMock.mock.calls[0];
    expect(JSON.parse(quoteInit.body)).toEqual({
      depositCoin: 'bch',
      settleCoin: 'btc',
      settleNetwork: 'liquid',
      settleAmount: '0.42',
      affiliateId: 'account',
      commissionRate: 0,
    });
  });

  it('sends settleMemo when the payment request includes a memo or destination tag', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'quote-1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'shift-1', depositAddress: 'bitcoincash:q', depositAmount: '0.1' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await createFixedBchShift(
      {
        address: 'rExampleXrpAddress',
        amount: '30',
        methodId: 'xrp',
        networkId: 'ripple',
        settleMemo: '12345',
      },
      { secret: 'secret', affiliateId: 'account' },
    );

    const [, shiftInit] = fetchMock.mock.calls[1];
    expect(JSON.parse(shiftInit.body)).toEqual({
      quoteId: 'quote-1',
      settleAddress: 'rExampleXrpAddress',
      settleMemo: '12345',
      affiliateId: 'account',
    });
  });

  it('adds a BCH/USD estimate to minimum deposit quote errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        text: async () =>
          JSON.stringify({
            error: { message: 'Amount too low. Minimum deposit amount: 0.01.' },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ 'bitcoin-cash': { usd: 450 } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createFixedBchShift(
        {
          address: 'bc1qexampleaddress',
          amount: '0.001',
          currencyCode: 'BTC',
          methodId: 'btc',
        },
        { secret: 'secret', affiliateId: 'account' },
      ),
    ).rejects.toThrow('Amount too low. Minimum deposit amount: 0.01 BCH (~4.50 USD)');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin-cash&vs_currencies=usd',
    );
  });

  it('keeps minimum deposit quote errors in BCH when the USD estimate is unavailable', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        text: async () =>
          JSON.stringify({
            error: { message: 'Amount too low. Minimum deposit amount: 0.01.' },
          }),
      })
      .mockResolvedValueOnce({
        ok: false,
        text: async () => 'price unavailable',
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createFixedBchShift(
        {
          address: 'bc1qexampleaddress',
          amount: '0.001',
          currencyCode: 'BTC',
          methodId: 'btc',
        },
        { secret: 'secret', affiliateId: 'account' },
      ),
    ).rejects.toThrow('Amount too low. Minimum deposit amount: 0.01 BCH');
  });
});

describe('fetchShiftsBulk', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns [] for empty input without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchShiftsBulk([])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('concatenates ids and does not send a secret header', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () =>
        JSON.stringify([
          { id: 'a', status: 'settled' },
          { id: 'b', status: 'waiting' },
        ]),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchShiftsBulk(['a', 'b']);

    expect(result.map((r) => r.id)).toEqual(['a', 'b']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://sideshift.ai/api/v2/shifts?ids=a%2Cb');
    expect(init?.method).toBe('GET');
    expect(init?.headers).toBeUndefined();
  });

  it('dedupes ids before requesting', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify([]),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchShiftsBulk(['a', 'a', 'b']);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://sideshift.ai/api/v2/shifts?ids=a%2Cb');
  });

  it('surfaces API error messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ error: { message: 'Order not found' } }),
      })),
    );

    await expect(fetchShiftsBulk(['a'])).rejects.toThrow('Order not found');
  });
});
