import { describe, expect, it } from 'vitest';

import { SUPPORTED_SCHEMES, buildBchDeepLink, parsePaymentCode } from '../lib/payment.js';

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
      'liquidnetwork:el1qqd0exampleliquidaddress?amount=0.42&assetid=6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d',
      {
        scheme: 'liquidnetwork',
        address: 'el1qqd0exampleliquidaddress',
        amount: '0.42',
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
        amount: '2500',
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
        amount: '12.5',
        amountLabel: '12.5 ADA',
        currencyCode: 'ADA',
        label: 'Cardano',
        methodId: 'ada',
        networkId: 'cardano',
      },
    ],
    [
      'algorand://ALGOEXAMPLEADDRESS?amount=1500000&note=order-123',
      {
        scheme: 'algorand',
        address: 'ALGOEXAMPLEADDRESS',
        amount: '1.5',
        amountLabel: '1.5 ALGO',
        currencyCode: 'ALGO',
        label: 'Algorand',
        methodId: 'algo',
        networkId: 'algorand',
        settleMemo: 'order-123',
      },
    ],
    [
      'polkadot:1DOTexampleaddress?amount=2.25',
      {
        scheme: 'polkadot',
        address: '1DOTexampleaddress',
        amount: '2.25',
        amountLabel: '2.25 DOT',
        currencyCode: 'DOT',
        label: 'Polkadot',
        methodId: 'dot',
        networkId: 'polkadot',
      },
    ],
    [
      'xrpl://rExampleXrpAddress?amount=30&dt=12345',
      {
        scheme: 'xrpl',
        address: 'rExampleXrpAddress',
        amount: '30',
        amountLabel: '30 XRP',
        currencyCode: 'XRP',
        label: 'XRP',
        methodId: 'xrp',
        networkId: 'ripple',
        settleMemo: '12345',
      },
    ],
    [
      'solana:9xQeWvG816bUx9EPexample?amount=0.75',
      {
        scheme: 'solana',
        address: '9xQeWvG816bUx9EPexample',
        amount: '0.75',
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
        amount: '15',
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
      ...expected,
    });
  });

  it('rejects missing amounts', () => {
    expect(() => parsePaymentCode('bitcoin:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh')).toThrow(
      'The payment code is missing an amount.',
    );
  });

  it('rejects Liquid BTC payment requests without the L-BTC asset id', () => {
    expect(() => parsePaymentCode('liquidnetwork:el1qqd0exampleliquidaddress?amount=0.42')).toThrow(
      'Liquid Bitcoin payment codes must include an assetid.',
    );
  });

  it('rejects decimal Algorand amounts', () => {
    expect(() => parsePaymentCode('algorand://ALGOEXAMPLEADDRESS?amount=1.5')).toThrow(
      'The payment amount must be a positive integer value.',
    );
  });

  it('rejects zcash payment requests', () => {
    expect(() => parsePaymentCode('zcash:t1exampleaddress?amount=1')).toThrow('Unsupported payment URI.');
  });

  it('rejects unsupported schemes', () => {
    expect(() => parsePaymentCode('ethereum:0x1234?amount=1')).toThrow('Unsupported payment URI.');
  });
});

describe('SUPPORTED_SCHEMES', () => {
  it('maps aliases to shared scheme configs', () => {
    expect(SUPPORTED_SCHEMES.liquid).toBe(SUPPORTED_SCHEMES.liquidnetwork);
    expect(SUPPORTED_SCHEMES.xec).toBe(SUPPORTED_SCHEMES.ecash);
    expect(SUPPORTED_SCHEMES['web+cardano']).toBe(SUPPORTED_SCHEMES.cardano);
    expect(SUPPORTED_SCHEMES.algo).toBe(SUPPORTED_SCHEMES.algorand);
    expect(SUPPORTED_SCHEMES.dot).toBe(SUPPORTED_SCHEMES.polkadot);
    expect(SUPPORTED_SCHEMES.xrp).toBe(SUPPORTED_SCHEMES.ripple);
    expect(SUPPORTED_SCHEMES.xrpl).toBe(SUPPORTED_SCHEMES.ripple);
    expect(SUPPORTED_SCHEMES.sol).toBe(SUPPORTED_SCHEMES.solana);
    expect(SUPPORTED_SCHEMES.trx).toBe(SUPPORTED_SCHEMES.tron);
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
