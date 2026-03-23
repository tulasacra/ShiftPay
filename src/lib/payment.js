const SUPPORTED_SCHEMES = Object.freeze({
  bitcoin: {
    currencyCode: 'BTC',
    methodId: 'btc',
    label: 'Bitcoin',
  },
  litecoin: {
    currencyCode: 'LTC',
    methodId: 'ltc',
    label: 'Litecoin',
  },
  dogecoin: {
    currencyCode: 'DOGE',
    methodId: 'doge',
    label: 'Dogecoin',
  },
  dash: {
    currencyCode: 'DASH',
    methodId: 'dash',
    label: 'Dash',
  },
  zcash: {
    currencyCode: 'ZEC',
    methodId: 'zec',
    label: 'Zcash',
  },
});

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
      'Unsupported payment URI. Supported schemes: bitcoin, litecoin, dogecoin, dash, zcash.',
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

export function truncateMiddle(value, visibleLength = 8) {
  if (!value || value.length <= visibleLength * 2 + 1) {
    return value;
  }

  return `${value.slice(0, visibleLength)}...${value.slice(-visibleLength)}`;
}

export { SUPPORTED_SCHEMES };
