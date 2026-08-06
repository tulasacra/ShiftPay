import { describe, expect, it } from 'vitest';

import {
  SUPPORTED_NETWORKS,
  SUPPORTED_SCHEMES,
  buildBchDeepLink,
  hasPayloadAmount,
  hasSchemePrefix,
  parsePaymentCode,
  readMissingAmountDetails,
  readMissingAmountNetwork,
  readSchemeCurrencyCode,
} from '../lib/payment.js';

describe('parsePaymentCode', () => {
  it('parses a BTC BIP21 payment request with formatted display amount in amountLabel', () => {
    expect(
      parsePaymentCode('bitcoin:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh?amount=1234.5678'),
    ).toEqual({
      raw: 'bitcoin:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh?amount=1234.5678',
      scheme: 'bitcoin',
      address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      amount: '1234.5678',
      amountLabel: '1,234.5678 BTC',
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
      'ecash:qq123exampleaddress?amount=12345',
      {
        scheme: 'ecash',
        address: 'qq123exampleaddress',
        amount: '12345',
        amountLabel: '12,345 XEC',
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
    [
      'ethereum:0x742d35Cc6634C0532925a3b844Bc454e4438f44e@1?value=2500000000000000000',
      {
        scheme: 'ethereum',
        address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        amount: '2.5',
        amountLabel: '2.5 ETH',
        currencyCode: 'ETH',
        label: 'Ethereum',
        methodId: 'eth',
        networkId: 'ethereum',
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

  it('reads Ethereum wei amounts written in scientific notation', () => {
    expect(
      parsePaymentCode('ethereum:0x742d35Cc6634C0532925a3b844Bc454e4438f44e?value=2.5e17'),
    ).toMatchObject({
      amount: '0.25',
      amountLabel: '0.25 ETH',
    });
  });

  it('accepts the EIP-831 pay- prefix and defaults to mainnet', () => {
    expect(
      parsePaymentCode('ethereum:pay-0x742d35Cc6634C0532925a3b844Bc454e4438f44e?value=1e18'),
    ).toMatchObject({
      address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      amount: '1',
      networkId: 'ethereum',
    });
  });

  it('rejects Ethereum payment requests for another chain', () => {
    expect(() =>
      parsePaymentCode('ethereum:0x742d35Cc6634C0532925a3b844Bc454e4438f44e@137?value=1e18'),
    ).toThrow('Ethereum payment codes must use mainnet (chain id 1).');
  });

  it('rejects Ethereum contract calls such as ERC-20 transfers', () => {
    expect(() =>
      parsePaymentCode(
        'ethereum:0xdAC17F958D2ee523a2206206994597C13D831ec7@1/transfer?address=0x742d35Cc6634C0532925a3b844Bc454e4438f44e&uint256=1e6',
      ),
    ).toThrow('Ethereum payment codes must pay ETH, not call a contract function.');
  });

  it('rejects Ethereum payment requests without a 0x account address', () => {
    expect(() => parsePaymentCode('ethereum:example.eth?value=1e18')).toThrow(
      'Ethereum payment codes must use a 0x account address.',
    );
  });

  it('rejects Ethereum payment requests without a value', () => {
    expect(() =>
      parsePaymentCode('ethereum:0x742d35Cc6634C0532925a3b844Bc454e4438f44e@1'),
    ).toThrow('The payment code is missing an amount.');
  });

  it('rejects zcash payment requests', () => {
    expect(() => parsePaymentCode('zcash:t1exampleaddress?amount=1')).toThrow('Unsupported payment URI.');
  });

  it('rejects unsupported schemes', () => {
    expect(() => parsePaymentCode('monero:4Aexampleaddress?amount=1')).toThrow(
      'Unsupported payment URI.',
    );
  });
});

describe('hasSchemePrefix', () => {
  it('detects codes that carry a network prefix', () => {
    expect(hasSchemePrefix('bitcoin:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh?amount=1')).toBe(true);
    expect(hasSchemePrefix('web+cardano:addr1qx2exampleaddress?amount=1')).toBe(true);
  });

  it('treats bare addresses as prefix-less', () => {
    expect(hasSchemePrefix('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh')).toBe(false);
    expect(hasSchemePrefix('  ALGOEXAMPLEADDRESS  ')).toBe(false);
  });
});

describe('hasPayloadAmount', () => {
  it('detects an amount query on a prefix-less payload', () => {
    expect(hasPayloadAmount('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh?amount=0.5')).toBe(true);
    expect(hasPayloadAmount('rExampleXrpAddress?amount=30&dt=12345')).toBe(true);
  });

  it('is false when the payload has no amount', () => {
    expect(hasPayloadAmount('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh')).toBe(false);
    expect(hasPayloadAmount('rExampleXrpAddress?dt=12345')).toBe(false);
  });
});

describe('readMissingAmountDetails', () => {
  it('names the network and currency of a prefixed code that carries no amount', () => {
    expect(
      readMissingAmountDetails('bitcoin:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'),
    ).toEqual({ label: 'Bitcoin', currencyCode: 'BTC' });
    expect(
      readMissingAmountDetails('xrpl://rExampleXrpAddress?dt=12345'),
    ).toEqual({ label: 'XRP', currencyCode: 'XRP' });
    expect(
      readMissingAmountDetails('ethereum:0x742d35Cc6634C0532925a3b844Bc454e4438f44e@1'),
    ).toEqual({ label: 'Ethereum', currencyCode: 'ETH' });
  });

  it('is null when the code already carries an amount or is unsupported', () => {
    expect(
      readMissingAmountDetails('bitcoin:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh?amount=0.5'),
    ).toBeNull();
    expect(readMissingAmountDetails('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh')).toBeNull();
    expect(readMissingAmountDetails('monero:4Aexampleaddress')).toBeNull();
  });
});

describe('readSchemeCurrencyCode', () => {
  it('maps a scheme to its currency code', () => {
    expect(readSchemeCurrencyCode('bitcoin')).toBe('BTC');
    expect(readSchemeCurrencyCode('xrpl')).toBe('XRP');
    expect(readSchemeCurrencyCode('ethereum')).toBe('ETH');
  });

  it('is empty for unsupported schemes', () => {
    expect(readSchemeCurrencyCode('monero')).toBe('');
  });
});

describe('readMissingAmountNetwork', () => {
  it('names the network of a prefixed code that carries no amount', () => {
    expect(readMissingAmountNetwork('bitcoin:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh')).toBe(
      'Bitcoin',
    );
    expect(
      readMissingAmountNetwork('bitcoin:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh?label=Coffee'),
    ).toBe('Bitcoin');
    expect(readMissingAmountNetwork('xrpl://rExampleXrpAddress?dt=12345')).toBe('XRP');
    expect(readMissingAmountNetwork('web+cardano:addr1qx2exampleaddress')).toBe('Cardano');
    expect(readMissingAmountNetwork('ethereum:0x742d35Cc6634C0532925a3b844Bc454e4438f44e@1')).toBe(
      'Ethereum',
    );
  });

  it('is empty when the code already carries an amount', () => {
    expect(
      readMissingAmountNetwork('bitcoin:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh?amount=0.5'),
    ).toBe('');
    expect(
      readMissingAmountNetwork('ethereum:0x742d35Cc6634C0532925a3b844Bc454e4438f44e?value=1e18'),
    ).toBe('');
  });

  it('is empty for prefix-less and unsupported codes', () => {
    expect(readMissingAmountNetwork('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh')).toBe('');
    expect(readMissingAmountNetwork('monero:4Aexampleaddress')).toBe('');
  });
});

describe('parsePaymentCode with a picked network', () => {
  it('parses a bare address using the picked scheme and amount', () => {
    expect(
      parsePaymentCode('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', {
        scheme: 'bitcoin',
        amount: '1234.5678',
      }),
    ).toEqual({
      raw: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      scheme: 'bitcoin',
      address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      amount: '1234.5678',
      amountLabel: '1,234.5678 BTC',
      currencyCode: 'BTC',
      label: 'Bitcoin',
      methodId: 'btc',
      networkId: 'bitcoin',
    });
  });

  it('reads a picked amount as the main unit, not the URI smallest unit', () => {
    expect(parsePaymentCode('ALGOEXAMPLEADDRESS', { scheme: 'algorand', amount: '1.5' })).toEqual({
      raw: 'ALGOEXAMPLEADDRESS',
      scheme: 'algorand',
      address: 'ALGOEXAMPLEADDRESS',
      amount: '1.5',
      amountLabel: '1.5 ALGO',
      currencyCode: 'ALGO',
      label: 'Algorand',
      methodId: 'algo',
      networkId: 'algorand',
    });
  });

  it('keeps memo parameters carried by a prefix-less code', () => {
    expect(
      parsePaymentCode('rExampleXrpAddress?dt=12345', { scheme: 'ripple', amount: '30' }),
    ).toEqual({
      raw: 'rExampleXrpAddress?dt=12345',
      scheme: 'ripple',
      address: 'rExampleXrpAddress',
      amount: '30',
      amountLabel: '30 XRP',
      currencyCode: 'XRP',
      label: 'XRP',
      methodId: 'xrp',
      networkId: 'ripple',
      settleMemo: '12345',
    });
  });

  it('uses the amount already present when only the scheme is picked', () => {
    expect(
      parsePaymentCode('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh?amount=0.5', {
        scheme: 'bitcoin',
      }),
    ).toMatchObject({
      amount: '0.5',
      amountLabel: '0.5 BTC',
      address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    });
  });

  it('reads a picked Ethereum amount as ETH, not wei', () => {
    expect(
      parsePaymentCode('0x742d35Cc6634C0532925a3b844Bc454e4438f44e', {
        scheme: 'ethereum',
        amount: '0.25',
      }),
    ).toEqual({
      raw: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      scheme: 'ethereum',
      address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      amount: '0.25',
      amountLabel: '0.25 ETH',
      currencyCode: 'ETH',
      label: 'Ethereum',
      methodId: 'eth',
      networkId: 'ethereum',
    });
  });

  it('rejects a picked scheme that is not supported', () => {
    expect(() => parsePaymentCode('4Aexampleaddress', { scheme: 'monero', amount: '1' })).toThrow(
      'Unsupported payment URI.',
    );
  });

  it('rejects a picked amount that is not a positive decimal', () => {
    expect(() => parsePaymentCode('bc1qexampleaddress', { scheme: 'bitcoin', amount: 'abc' })).toThrow(
      'The payment amount must be a positive decimal value.',
    );
  });

  it('still requires the L-BTC asset id when Liquid Bitcoin is picked', () => {
    expect(() =>
      parsePaymentCode('el1qqd0exampleliquidaddress', { scheme: 'liquidnetwork', amount: '0.42' }),
    ).toThrow('Liquid Bitcoin payment codes must include an assetid.');
  });
});

describe('parsePaymentCode with a typed amount', () => {
  it('keeps the scheme, address and memo carried by the prefixed code', () => {
    expect(parsePaymentCode('xrpl://rExampleXrpAddress?dt=12345', { amount: '30' })).toEqual({
      raw: 'xrpl://rExampleXrpAddress?dt=12345',
      scheme: 'xrpl',
      address: 'rExampleXrpAddress',
      amount: '30',
      amountLabel: '30 XRP',
      currencyCode: 'XRP',
      label: 'XRP',
      methodId: 'xrp',
      networkId: 'ripple',
      settleMemo: '12345',
    });
  });

  it('reads a typed Ethereum amount as ETH, not wei', () => {
    expect(
      parsePaymentCode('ethereum:0x742d35Cc6634C0532925a3b844Bc454e4438f44e@1', {
        amount: '0.25',
      }),
    ).toMatchObject({
      address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      amount: '0.25',
      amountLabel: '0.25 ETH',
    });
  });

  it('reads a typed Algorand amount as ALGO, not microAlgos', () => {
    expect(
      parsePaymentCode('algorand://ALGOEXAMPLEADDRESS?note=order-123', { amount: '1.5' }),
    ).toMatchObject({
      amount: '1.5',
      amountLabel: '1.5 ALGO',
      settleMemo: 'order-123',
    });
  });

  it('rejects a typed amount that is not greater than zero', () => {
    expect(() => parsePaymentCode('bitcoin:bc1qexampleaddress', { amount: '0' })).toThrow(
      'The payment amount must be greater than zero.',
    );
  });
});

describe('SUPPORTED_NETWORKS', () => {
  it('lists one canonical scheme per supported network', () => {
    expect(SUPPORTED_NETWORKS).toEqual([
      { scheme: 'bitcoin', label: 'Bitcoin', currencyCode: 'BTC' },
      { scheme: 'litecoin', label: 'Litecoin', currencyCode: 'LTC' },
      { scheme: 'dogecoin', label: 'Dogecoin', currencyCode: 'DOGE' },
      { scheme: 'dash', label: 'Dash', currencyCode: 'DASH' },
      { scheme: 'liquidnetwork', label: 'Liquid Bitcoin', currencyCode: 'BTC' },
      { scheme: 'ecash', label: 'eCash', currencyCode: 'XEC' },
      { scheme: 'cardano', label: 'Cardano', currencyCode: 'ADA' },
      { scheme: 'algorand', label: 'Algorand', currencyCode: 'ALGO' },
      { scheme: 'polkadot', label: 'Polkadot', currencyCode: 'DOT' },
      { scheme: 'ripple', label: 'XRP', currencyCode: 'XRP' },
      { scheme: 'solana', label: 'Solana', currencyCode: 'SOL' },
      { scheme: 'tron', label: 'Tron', currencyCode: 'TRX' },
      { scheme: 'ethereum', label: 'Ethereum', currencyCode: 'ETH' },
    ]);
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
    expect(SUPPORTED_SCHEMES.eth).toBe(SUPPORTED_SCHEMES.ethereum);
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
