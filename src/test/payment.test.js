import { describe, expect, it } from 'vitest';

import { buildBchDeepLink, parsePaymentCode } from '../lib/payment.js';

describe('parsePaymentCode', () => {
  it('parses a BTC BIP21 payment request', () => {
    expect(parsePaymentCode('bitcoin:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh?amount=0.015')).toEqual({
      raw: 'bitcoin:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh?amount=0.015',
      scheme: 'bitcoin',
      address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      amount: '0.015',
      amountLabel: '0.015 BTC',
      currencyCode: 'BTC',
      label: 'Bitcoin',
      methodId: 'btc',
    });
  });

  it('rejects missing amounts', () => {
    expect(() => parsePaymentCode('bitcoin:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh')).toThrow(
      'The payment code is missing an amount.',
    );
  });

  it('rejects unsupported schemes', () => {
    expect(() => parsePaymentCode('ethereum:0x1234?amount=1')).toThrow('Unsupported payment URI.');
  });
});

describe('buildBchDeepLink', () => {
  it('creates a BCH wallet deep link', () => {
    expect(buildBchDeepLink('bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a', '0.1234')).toBe(
      'bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a?amount=0.1234',
    );
  });
});
