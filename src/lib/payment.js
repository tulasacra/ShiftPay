import { formatEnUsNumber } from './formatNumber.js';

const LIQUID_BTC_ASSET_ID = '6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d';
const ETHEREUM_MAINNET_CHAIN_ID = '1';
const ETHEREUM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const SCIENTIFIC_PATTERN = /^(\d+)(?:\.(\d+))?[eE]\+?(\d+)$/;

const SUPPORTED_SCHEME_GROUPS = Object.freeze([
  {
    schemes: ['bitcoin'],
    config: {
      currencyCode: 'BTC',
      methodId: 'btc',
      networkId: 'bitcoin',
      label: 'Bitcoin',
    },
  },
  {
    schemes: ['litecoin'],
    config: {
      currencyCode: 'LTC',
      methodId: 'ltc',
      networkId: 'litecoin',
      label: 'Litecoin',
    },
  },
  {
    schemes: ['dogecoin'],
    config: {
      currencyCode: 'DOGE',
      methodId: 'doge',
      networkId: 'doge',
      label: 'Dogecoin',
    },
  },
  {
    schemes: ['dash'],
    config: {
      currencyCode: 'DASH',
      methodId: 'dash',
      networkId: 'dash',
      label: 'Dash',
    },
  },
  {
    schemes: ['liquidnetwork', 'liquid'],
    config: {
      currencyCode: 'BTC',
      methodId: 'btc',
      networkId: 'liquid',
      assetId: LIQUID_BTC_ASSET_ID,
      label: 'Liquid Bitcoin',
    },
  },
  {
    schemes: ['ecash', 'xec'],
    config: {
      currencyCode: 'XEC',
      methodId: 'xec',
      networkId: 'xec',
      label: 'eCash',
    },
  },
  {
    schemes: ['cardano', 'web+cardano'],
    config: {
      currencyCode: 'ADA',
      methodId: 'ada',
      networkId: 'cardano',
      label: 'Cardano',
    },
  },
  {
    schemes: ['algorand', 'algo'],
    config: {
      currencyCode: 'ALGO',
      methodId: 'algo',
      networkId: 'algorand',
      amountDecimals: 6,
      integerAmount: true,
      memoKeys: ['xnote', 'note'],
      label: 'Algorand',
    },
  },
  {
    schemes: ['polkadot', 'dot'],
    config: {
      currencyCode: 'DOT',
      methodId: 'dot',
      networkId: 'polkadot',
      label: 'Polkadot',
    },
  },
  {
    schemes: ['ripple', 'xrp', 'xrpl'],
    config: {
      currencyCode: 'XRP',
      methodId: 'xrp',
      networkId: 'ripple',
      memoKeys: ['dt'],
      label: 'XRP',
    },
  },
  {
    schemes: ['solana', 'sol'],
    config: {
      currencyCode: 'SOL',
      methodId: 'sol',
      networkId: 'solana',
      label: 'Solana',
    },
  },
  {
    schemes: ['tron', 'trx'],
    config: {
      currencyCode: 'TRX',
      methodId: 'trx',
      networkId: 'tron',
      label: 'Tron',
    },
  },
  {
    schemes: ['ethereum', 'eth'],
    config: {
      currencyCode: 'ETH',
      methodId: 'eth',
      networkId: 'ethereum',
      amountKeys: ['value'],
      amountDecimals: 18,
      integerAmount: true,
      eip681: true,
      label: 'Ethereum',
    },
  },
]);

const SUPPORTED_SCHEMES = Object.freeze(
  Object.fromEntries(
    SUPPORTED_SCHEME_GROUPS.flatMap(({ schemes, config }) => {
      const frozenConfig = Object.freeze({ ...config });
      return schemes.map((scheme) => [scheme, frozenConfig]);
    }),
  ),
);

const SUPPORTED_SCHEME_LABEL = SUPPORTED_SCHEME_GROUPS.map(({ schemes }) => schemes.join('/')).join(', ');

const SUPPORTED_NETWORKS = Object.freeze(
  SUPPORTED_SCHEME_GROUPS.map(({ schemes, config }) =>
    Object.freeze({ scheme: schemes[0], label: config.label }),
  ),
);

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

function splitPayload(payload) {
  const [rawAddress, rawQuery = ''] = payload.replace(/^\/\//, '').split('?');

  return {
    address: decodeValue(rawAddress),
    query: readQuery(rawQuery),
  };
}

export function hasSchemePrefix(rawValue) {
  return normalizeUri(rawValue).indexOf(':') >= 1;
}

/** True when a prefix-less payload already carries an amount query parameter. */
export function hasPayloadAmount(rawValue) {
  return Boolean(splitPayload(normalizeUri(rawValue)).query.amount);
}

function parseUriParts(rawValue, schemeOverride) {
  const trimmed = normalizeUri(rawValue);

  if (schemeOverride) {
    return {
      scheme: schemeOverride.toLowerCase(),
      ...splitPayload(trimmed),
      raw: trimmed,
    };
  }

  const separatorIndex = trimmed.indexOf(':');

  if (separatorIndex < 1) {
    throw new Error('The QR code is not a supported crypto payment URI.');
  }

  return {
    scheme: trimmed.slice(0, separatorIndex).toLowerCase(),
    ...splitPayload(trimmed.slice(separatorIndex + 1)),
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

/** EIP-681 writes wei amounts in scientific notation (2.5e17), which the amount patterns reject. */
function expandScientificNotation(amountText) {
  const match = SCIENTIFIC_PATTERN.exec(amountText);

  if (!match) {
    return amountText;
  }

  const [, whole, fraction = '', exponent] = match;
  const trailingZeros = Number(exponent) - fraction.length;

  return trailingZeros < 0 ? amountText : `${whole}${fraction}${'0'.repeat(trailingZeros)}`;
}

function readAmountText(query, config) {
  for (const key of config.amountKeys || ['amount']) {
    if (query[key]) {
      return query[key];
    }
  }
  return '';
}

function parseAmount(amountText, config) {
  if (!amountText) {
    throw new Error('The payment code is missing an amount.');
  }

  const normalizedAmount = config.eip681 ? expandScientificNotation(amountText) : amountText;

  if (config.integerAmount) {
    if (!INTEGER_PATTERN.test(normalizedAmount)) {
      throw new Error('The payment amount must be a positive integer value.');
    }
  } else if (!DECIMAL_PATTERN.test(normalizedAmount)) {
    throw new Error('The payment amount must be a positive decimal value.');
  }

  const numericAmount = Number(normalizedAmount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error('The payment amount must be greater than zero.');
  }

  if (config.integerAmount && config.amountDecimals) {
    return formatSmallestUnitAmount(normalizedAmount, config.amountDecimals);
  }

  return normalizedAmount;
}

/** A hand-entered amount is always the coin's main unit, never a URI smallest-unit value. */
function parseMainUnitAmount(amountText) {
  return parseAmount(amountText, {});
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

/** EIP-681/EIP-831 target: [pay-]<address>[@<chain_id>][/<function_name>]. */
function readEthereumTarget(target) {
  const [account, functionName] = target.replace(/^pay-/i, '').split('/');
  const [address, chainId] = account.split('@');

  if (functionName) {
    throw new Error('Ethereum payment codes must pay ETH, not call a contract function.');
  }

  if (chainId && chainId !== ETHEREUM_MAINNET_CHAIN_ID) {
    throw new Error('Ethereum payment codes must use mainnet (chain id 1).');
  }

  if (!ETHEREUM_ADDRESS_PATTERN.test(address)) {
    throw new Error('Ethereum payment codes must use a 0x account address.');
  }

  return address;
}

function readSettleMemo(query, config) {
  for (const key of config.memoKeys || []) {
    if (query[key]) {
      return query[key];
    }
  }
  return '';
}

export function parsePaymentCode(rawValue, options = {}) {
  const { scheme, address, query, raw } = parseUriParts(rawValue, options.scheme);
  const config = requireSupportedScheme(scheme);
  requireSupportedAsset(query, config);
  const settleAddress = config.eip681 ? readEthereumTarget(address) : address;
  const amount =
    options.amount === undefined
      ? parseAmount(readAmountText(query, config), config)
      : parseMainUnitAmount(options.amount);

  if (!settleAddress) {
    throw new Error('The payment code is missing a destination address.');
  }

  const settleMemo = readSettleMemo(query, config);

  return {
    raw,
    scheme,
    address: settleAddress,
    amount,
    amountLabel: `${formatEnUsNumber(amount)} ${config.currencyCode}`,
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

export { SUPPORTED_NETWORKS, SUPPORTED_SCHEMES, SUPPORTED_SCHEME_LABEL };
