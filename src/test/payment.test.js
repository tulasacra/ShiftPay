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
      networkId: 'bitcoin',
    });
  });

  it.each([
    [
      'liquidnetwork:el1qqd0exampleliquidaddress?amount=0.42',
      {
        scheme: 'liquidnetwork',
        address: 'el1qqd0exampleliquidaddress',
        amountLabel: '0.42 BTC',
        currencyCode: 'BTC',
        label: 'Liquid Bitcoin',
        methodId: 'btc',
        networkId: 'liquid',
      },
    ],
    [
      'ecash:qq123exampleaddress?amount=2500',
      {
        scheme: 'ecash',
        address: 'qq123exampleaddress',
        amountLabel: '2500 XEC',
        currencyCode: 'XEC',
        label: 'eCash',
        methodId: 'xec',
        networkId: 'xec',
      },
    ],
    [
      'cardano:addr1qx2exampleaddress?amount=12.5',
      {
        scheme: 'cardano',
        address: 'addr1qx2exampleaddress',
        amountLabel: '12.5 ADA',
        currencyCode: 'ADA',
        label: 'Cardano',
        methodId: 'ada',
        networkId: 'cardano',
      },
    ],
    [
      'algorand:ALGOEXAMPLEADDRESS?amount=1.5',
      {
        scheme: 'algorand',
        address: 'ALGOEXAMPLEADDRESS',
        amountLabel: '1.5 ALGO',
        currencyCode: 'ALGO',
        label: 'Algorand',
        methodId: 'algo',
        networkId: 'algorand',
      },
    ],
    [
      'polkadot:1DOTexampleaddress?amount=2.25',
      {
        scheme: 'polkadot',
        address: '1DOTexampleaddress',
        amountLabel: '2.25 DOT',
        currencyCode: 'DOT',
        label: 'Polkadot',
        methodId: 'dot',
        networkId: 'polkadot',
      },
    ],
    [
      'ripple:rExampleXrpAddress?amount=30',
      {
        scheme: 'ripple',
        address: 'rExampleXrpAddress',
        amountLabel: '30 XRP',
        currencyCode: 'XRP',
        label: 'XRP',
        methodId: 'xrp',
        networkId: 'ripple',
      },
    ],
    [
      'solana:9xQeWvG816bUx9EPexample?amount=0.75',
      {
        scheme: 'solana',
        address: '9xQeWvG816bUx9EPexample',
        amountLabel: '0.75 SOL',
        currencyCode: 'SOL',
        label: 'Solana',
        methodId: 'sol',
        networkId: 'solana',
      },
    ],
    [
      'tron:TExampleTronAddress?amount=15',
      {
        scheme: 'tron',
        address: 'TExampleTronAddress',
        amountLabel: '15 TRX',
        currencyCode: 'TRX',
        label: 'Tron',
        methodId: 'trx',
        networkId: 'tron',
      },
    ],
  ])('parses a %s payment request', (uri, expected) => {
    expect(parsePaymentCode(uri)).toEqual({
      raw: uri,
      amount: uri.match(/amount=([^&]+)/)[1],
      ...expected,
    });
  });

  it('rejects missing amounts', () => {
    expect(() => parsePaymentCode('bitcoin:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh')).toThrow(
      'The payment code is missing an amount.',
    );
  });

  it('rejects zcash payment requests', () => {
    expect(() => parsePaymentCode('zcash:t1exampleaddress?amount=1')).toThrow('Unsupported payment URI.');
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

  it('adds a memo parameter when provided', () => {
    expect(
      buildBchDeepLink('bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a', '0.1', 'hello'),
    ).toBe('bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a?amount=0.1&message=hello');
  });
});
