const SUPPORTED_SCHEMES = Object.freeze({
  bitcoin: {
    currencyCode: 'BTC',
    methodId: 'btc',
    networkId: 'bitcoin',
    label: 'Bitcoin',
  },
  litecoin: {
    currencyCode: 'LTC',
    methodId: 'ltc',
    networkId: 'litecoin',
    label: 'Litecoin',
  },
  dogecoin: {
    currencyCode: 'DOGE',
    methodId: 'doge',
    networkId: 'dogecoin',
    label: 'Dogecoin',
  },
  dash: {
    currencyCode: 'DASH',
    methodId: 'dash',
    networkId: 'dash',
    label: 'Dash',
  },
  liquidnetwork: {
    currencyCode: 'BTC',
    methodId: 'btc',
    networkId: 'liquid',
    label: 'Liquid Bitcoin',
  },
  liquid: {
    currencyCode: 'BTC',
    methodId: 'btc',
    networkId: 'liquid',
    label: 'Liquid Bitcoin',
  },
  ecash: {
    currencyCode: 'XEC',
    methodId: 'xec',
    networkId: 'xec',
    label: 'eCash',
  },
  xec: {
    currencyCode: 'XEC',
    methodId: 'xec',
    networkId: 'xec',
    label: 'eCash',
  },
  cardano: {
    currencyCode: 'ADA',
    methodId: 'ada',
    networkId: 'cardano',
    label: 'Cardano',
  },
  'web+cardano': {
    currencyCode: 'ADA',
    methodId: 'ada',
    networkId: 'cardano',
    label: 'Cardano',
  },
  algorand: {
    currencyCode: 'ALGO',
    methodId: 'algo',
    networkId: 'algorand',
    label: 'Algorand',
  },
  algo: {
    currencyCode: 'ALGO',
    methodId: 'algo',
    networkId: 'algorand',
    label: 'Algorand',
  },
  polkadot: {
    currencyCode: 'DOT',
    methodId: 'dot',
    networkId: 'polkadot',
    label: 'Polkadot',
  },
  dot: {
    currencyCode: 'DOT',
    methodId: 'dot',
    networkId: 'polkadot',
    label: 'Polkadot',
  },
  ripple: {
    currencyCode: 'XRP',
    methodId: 'xrp',
    networkId: 'ripple',
    label: 'XRP',
  },
  xrp: {
    currencyCode: 'XRP',
    methodId: 'xrp',
    networkId: 'ripple',
    label: 'XRP',
  },
  xrpl: {
    currencyCode: 'XRP',
    methodId: 'xrp',
    networkId: 'ripple',
    label: 'XRP',
  },
  solana: {
    currencyCode: 'SOL',
    methodId: 'sol',
    networkId: 'solana',
    label: 'Solana',
  },
  sol: {
    currencyCode: 'SOL',
    methodId: 'sol',
    networkId: 'solana',
    label: 'Solana',
  },
  tron: {
    currencyCode: 'TRX',
    methodId: 'trx',
    networkId: 'tron',
    label: 'Tron',
  },
  trx: {
    currencyCode: 'TRX',
    methodId: 'trx',
    networkId: 'tron',
    label: 'Tron',
  },
});

const SUPPORTED_SCHEME_LABEL = 'bitcoin, litecoin, dogecoin, dash, liquidnetwork/liquid, ecash/xec, cardano/web+cardano, algorand/algo, polkadot/dot, ripple/xrp/xrpl, solana/sol, tron/trx';

const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

function decodeValue(value) {
  return decodeURIComponent(value.replace(/\+/g, ' '));
}

function readQuery(queryString) {
  return queryString
    .split('&')
    .filter(Boolean)
    .reduce((params, pair) => {
      const [rawKey, rawValue = ''] = pair.split('=');
      params[decodeValue(rawKey)] = decodeValue(rawValue);
      return params;
    }, {});
}

function normalizeUri(rawValue) {
  return rawValue.trim().replace(/\u00a0/g, ' ');
}

function parseUriParts(rawValue) {
  const trimmed = normalizeUri(rawValue);
  const separatorIndex = trimmed.indexOf(':');

  if (separatorIndex < 1) {
    throw new Error('The QR code is not a supported crypto payment URI.');
  }

  const scheme = trimmed.slice(0, separatorIndex).toLowerCase();
  const payload = trimmed.slice(separatorIndex + 1).replace(/^\/\//, '');
  const [rawAddress, rawQuery = ''] = payload.split('?');

  return {
    scheme,
    address: decodeValue(rawAddress),
    query: readQuery(rawQuery),
    raw: trimmed,
  };
}

function requireSupportedScheme(scheme) {
  const config = SUPPORTED_SCHEMES[scheme];

  if (!config) {
    throw new Error(
      `Unsupported payment URI. Supported schemes: ${SUPPORTED_SCHEME_LABEL}.`,
    );
  }

  return config;
}

function parseAmount(amountText) {
  if (!amountText) {
    throw new Error('The payment code is missing an amount.');
  }

  if (!DECIMAL_PATTERN.test(amountText)) {
    throw new Error('The payment amount must be a positive decimal value.');
  }

  const numericAmount = Number(amountText);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error('The payment amount must be greater than zero.');
  }

  return amountText;
}

export function parsePaymentCode(rawValue) {
  const { scheme, address, query, raw } = parseUriParts(rawValue);
  const config = requireSupportedScheme(scheme);
  const amount = parseAmount(query.amount);

  if (!address) {
    throw new Error('The payment code is missing a destination address.');
  }

  return {
    raw,
    scheme,
    address,
    amount,
    amountLabel: `${amount} ${config.currencyCode}`,
    currencyCode: config.currencyCode,
    label: config.label,
    methodId: config.methodId,
    networkId: config.networkId,
  };
}

export function buildBchDeepLink(address, amount, memo) {
  if (!address || !amount) {
    throw new Error('A BCH address and amount are required to build the wallet link.');
  }

  const normalizedAddress = address.replace(/^bitcoincash:/i, '');
  const params = new URLSearchParams();
  params.set('amount', amount);
  if (memo) {
    params.set('message', memo);
  }

  return `bitcoincash:${normalizedAddress}?${params.toString()}`;
}

export { SUPPORTED_SCHEMES };
