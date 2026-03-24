import { describe, expect, it } from 'vitest';

import { enrichSideshiftAmountErrorMessage } from '../lib/sideshift.js';

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

  it('clarifies settle amount errors with the payment request currency', () => {
    expect(
      enrichSideshiftAmountErrorMessage(
        'Amount too low. Settle amount is less than or equals to 0',
        { currencyCode: 'LTC' },
      ),
    ).toBe('Amount too low. Settle amount is less than or equals to 0 (LTC in the payment request.)');
  });

  it('returns the original message when payment currency is unknown', () => {
    const msg = 'Amount too low. Minimum deposit amount: 1';
    expect(enrichSideshiftAmountErrorMessage(msg, null)).toBe(msg);
  });
});
