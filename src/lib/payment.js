const LIQUID_BTC_ASSET_ID = '6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d';

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
    networkId: 'doge',
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
    assetId: LIQUID_BTC_ASSET_ID,
    label: 'Liquid Bitcoin',
  },
  liquid: {
    currencyCode: 'BTC',
    methodId: 'btc',
    networkId: 'liquid',
    assetId: LIQUID_BTC_ASSET_ID,
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
    amountDecimals: 6,
    integerAmount: true,
    memoKeys: ['xnote', 'note'],
    label: 'Algorand',
  },
  algo: {
    currencyCode: 'ALGO',
    methodId: 'algo',
    networkId: 'algorand',
    amountDecimals: 6,
    integerAmount: true,
    memoKeys: ['xnote', 'note'],
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
    memoKeys: ['dt'],
    label: 'XRP',
  },
  xrp: {
    currencyCode: 'XRP',
    methodId: 'xrp',
    networkId: 'ripple',
    memoKeys: ['dt'],
    label: 'XRP',
  },
  xrpl: {
    currencyCode: 'XRP',
    methodId: 'xrp',
    networkId: 'ripple',
    memoKeys: ['dt'],
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
const INTEGER_PATTERN = /^(?:0|[1-9]\d*)$/;

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

function formatSmallestUnitAmount(amountText, decimals) {
  const padded = amountText.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

function parseAmount(amountText, config) {
  if (!amountText) {
    throw new Error('The payment code is missing an amount.');
  }

  if (config.integerAmount) {
    if (!INTEGER_PATTERN.test(amountText)) {
      throw new Error('The payment amount must be a positive integer value.');
    }
  } else if (!DECIMAL_PATTERN.test(amountText)) {
    throw new Error('The payment amount must be a positive decimal value.');
  }

  const numericAmount = Number(amountText);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error('The payment amount must be greater than zero.');
  }

  if (config.integerAmount && config.amountDecimals) {
    return formatSmallestUnitAmount(amountText, config.amountDecimals);
  }

  return amountText;
}

function requireSupportedAsset(query, config) {
  if (!config.assetId) {
    return;
  }

  if (!query.assetid) {
    throw new Error(`${config.label} payment codes must include an assetid.`);
  }

  if (query.assetid.toLowerCase() !== config.assetId) {
    throw new Error(`${config.label} payment codes must request L-BTC.`);
  }
}

function readSettleMemo(query, config) {
  for (const key of config.memoKeys || []) {
    if (query[key]) {
      return query[key];
    }
  }
  return '';
}

export function parsePaymentCode(rawValue) {
  const { scheme, address, query, raw } = parseUriParts(rawValue);
  const config = requireSupportedScheme(scheme);
  requireSupportedAsset(query, config);
  const amount = parseAmount(query.amount, config);

  if (!address) {
    throw new Error('The payment code is missing a destination address.');
  }

  const settleMemo = readSettleMemo(query, config);

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
    ...(settleMemo ? { settleMemo } : {}),
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
