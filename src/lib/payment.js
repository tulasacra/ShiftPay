import { formatEnUsNumber } from './formatNumber.js';

const LIQUID_BTC_ASSET_ID = '6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d';
const ETHEREUM_MAINNET_CHAIN_ID = '1';
const ETHEREUM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const SCIENTIFIC_PATTERN = /^(\d+)(?:\.(\d+))?[eE]\+?(\d+)$/;

const BASE58 = '[1-9A-HJ-NP-Za-km-z]';
const BECH32 = '[0-9a-z]';
const BASE32 = '[A-Z2-7]';

/** Anchored matcher for the recipient formats a network uses, to detect prefix-less codes. */
function addressForms(...forms) {
  return new RegExp(`^(?:${forms.join('|')})$`);
}

const SUPPORTED_SCHEME_GROUPS = Object.freeze([
  {
    schemes: ['bitcoin'],
    config: {
      currencyCode: 'BTC',
      methodId: 'btc',
      networkId: 'bitcoin',
      label: 'Bitcoin',
      addressPattern: addressForms(`[13]${BASE58}{25,33}`, `bc1${BECH32}{11,71}`),
    },
  },
  {
    schemes: ['litecoin'],
    config: {
      currencyCode: 'LTC',
      methodId: 'ltc',
      networkId: 'litecoin',
      label: 'Litecoin',
      // Litecoin still accepts the legacy 3-prefix P2SH form it shares with Bitcoin.
      addressPattern: addressForms(`[LM3]${BASE58}{25,33}`, `ltc1${BECH32}{11,71}`),
    },
  },
  {
    schemes: ['dogecoin'],
    config: {
      currencyCode: 'DOGE',
      methodId: 'doge',
      networkId: 'doge',
      label: 'Dogecoin',
      addressPattern: addressForms(`[D9A]${BASE58}{32,33}`),
    },
  },
  {
    schemes: ['dash'],
    config: {
      currencyCode: 'DASH',
      methodId: 'dash',
      networkId: 'dash',
      label: 'Dash',
      addressPattern: addressForms(`[X7]${BASE58}{32,33}`),
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
      addressPattern: addressForms(
        `lq1${BECH32}{20,}`,
        `ex1${BECH32}{11,71}`,
        `V(?:JL|T)${BASE58}{60,90}`,
      ),
    },
  },
  {
    schemes: ['ecash', 'xec'],
    config: {
      currencyCode: 'XEC',
      methodId: 'xec',
      networkId: 'xec',
      label: 'eCash',
      addressPattern: addressForms(`[qp]${BECH32}{41}`),
    },
  },
  {
    schemes: ['cardano', 'web+cardano'],
    config: {
      currencyCode: 'ADA',
      methodId: 'ada',
      networkId: 'cardano',
      label: 'Cardano',
      addressPattern: addressForms(`addr1${BECH32}{50,}`),
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
      addressPattern: addressForms(`${BASE32}{58}`),
    },
  },
  {
    schemes: ['polkadot', 'dot'],
    config: {
      currencyCode: 'DOT',
      methodId: 'dot',
      networkId: 'polkadot',
      label: 'Polkadot',
      addressPattern: addressForms(`1${BASE58}{46,47}`),
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
      addressPattern: addressForms(`r${BASE58}{24,34}`),
    },
  },
  {
    schemes: ['solana', 'sol'],
    config: {
      currencyCode: 'SOL',
      methodId: 'sol',
      networkId: 'solana',
      label: 'Solana',
      addressPattern: addressForms(`${BASE58}{43,44}`),
    },
  },
  {
    schemes: ['tron', 'trx'],
    config: {
      currencyCode: 'TRX',
      methodId: 'trx',
      networkId: 'tron',
      label: 'Tron',
      addressPattern: addressForms(`T${BASE58}{33}`),
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
      addressPattern: ETHEREUM_ADDRESS_PATTERN,
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
    Object.freeze({
      scheme: schemes[0],
      label: config.label,
      currencyCode: config.currencyCode,
    }),
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
export function hasPayloadAmount(rawValue, scheme) {
  const { query } = splitPayload(normalizeUri(rawValue));
  return Boolean(readAmountText(query, SUPPORTED_SCHEMES[scheme?.toLowerCase()] ?? {}));
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

  if (trailingZeros < 0) {
    return amountText;
  }

  // Coefficients like 0.01e18 expand to 001e16 digits; strip leading zeros for INTEGER_PATTERN.
  const digits = `${whole}${fraction}${'0'.repeat(trailingZeros)}`;
  return digits.replace(/^0+/, '') || '0';
}

function readAmountText(query, config) {
  for (const key of config.amountKeys || ['amount']) {
    if (query[key]) {
      return query[key];
    }
  }
  return '';
}

/** The network label of a prefixed code that names a supported scheme but carries no amount, else ''. */
export function readMissingAmountNetwork(rawValue) {
  const details = readMissingAmountDetails(rawValue);
  return details ? details.label : '';
}

/** Label, currency and SideShift settle ids of a prefixed code with no amount, else null. */
export function readMissingAmountDetails(rawValue) {
  if (!hasSchemePrefix(rawValue)) {
    return null;
  }

  const { scheme, query } = parseUriParts(rawValue);
  const config = SUPPORTED_SCHEMES[scheme];

  if (!config || readAmountText(query, config)) {
    return null;
  }

  return {
    label: config.label,
    currencyCode: config.currencyCode,
    methodId: config.methodId,
    networkId: config.networkId,
  };
}

/** Settle targets of every supported network whose recipient format fits a prefix-less payload. */
export function detectNetworksFromAddress(rawValue) {
  const { address } = splitPayload(normalizeUri(rawValue));

  if (!address) {
    return [];
  }

  return SUPPORTED_SCHEME_GROUPS.filter(({ config }) => config.addressPattern.test(address)).map(
    ({ schemes, config }) => ({
      scheme: schemes[0],
      label: config.label,
      currencyCode: config.currencyCode,
      methodId: config.methodId,
      networkId: config.networkId,
    }),
  );
}

export function readSchemeCurrencyCode(scheme) {
  return readSchemeSettleTarget(scheme)?.currencyCode ?? '';
}

/** SideShift settle target for a supported URI scheme, else null. */
export function readSchemeSettleTarget(scheme) {
  const config = SUPPORTED_SCHEMES[scheme?.toLowerCase()];
  if (!config) {
    return null;
  }
  return {
    label: config.label,
    currencyCode: config.currencyCode,
    methodId: config.methodId,
    networkId: config.networkId,
  };
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
