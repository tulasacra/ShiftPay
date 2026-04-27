const SIDESHIFT_API_V2 = 'https://sideshift.ai/api/v2';
const BCH_USD_PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin-cash&vs_currencies=usd';

function parseJsonResponse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function httpErrorMessage(data, fallback) {
  if (!data) {
    return fallback;
  }
  if (typeof data.error === 'string') {
    return data.error;
  }
  if (data.error && typeof data.error.message === 'string') {
    return data.error.message;
  }
  if (typeof data.message === 'string') {
    return data.message;
  }
  return fallback;
}

function formatBchUsdEstimate(bchAmount, bchUsdRate) {
  const bch = Number(bchAmount);
  const rate = Number(bchUsdRate);
  if (!Number.isFinite(bch) || bch <= 0 || !Number.isFinite(rate) || rate <= 0) {
    return null;
  }

  const usd = bch * rate;
  if (usd > 0 && usd < 0.01) {
    return '<0.01';
  }
  return usd.toFixed(2);
}

/**
 * SideShift min/max deposit errors often end with a bare number; fixed BCH→* quotes use BCH as deposit.
 * Settle-side errors refer to the scanned payment amount (paymentRequest currency).
 */
export function enrichSideshiftAmountErrorMessage(message, paymentRequest, options = {}) {
  if (!message || !paymentRequest?.currencyCode) {
    return message;
  }

  const s = String(message).trim();

  const amountPattern = '([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?)';
  const depositLow = new RegExp(
    `^(Amount too low\\. Minimum deposit amount:\\s*)${amountPattern}(?:\\s*BCH)?\\.?\\s*$`,
    'i',
  );
  const depositHigh = new RegExp(
    `^(Amount too high\\. Maximum deposit amount:\\s*)${amountPattern}(?:\\s*BCH)?\\.?\\s*$`,
    'i',
  );

  const lowMatch = s.match(depositLow);
  if (lowMatch) {
    const base = `${lowMatch[1]}${lowMatch[2]} BCH`;
    const usd = formatBchUsdEstimate(lowMatch[2], options.bchUsdRate);
    return usd ? `${base} (~${usd} USD)` : base;
  }

  const highMatch = s.match(depositHigh);
  if (highMatch) {
    const base = `${highMatch[1]}${highMatch[2]} BCH`;
    const usd = formatBchUsdEstimate(highMatch[2], options.bchUsdRate);
    return usd ? `${base} (~${usd} USD)` : base;
  }

  return message;
}

async function fetchBchUsdRate(options = {}) {
  const res = await fetch(BCH_USD_PRICE_URL, {
    method: 'GET',
    signal: options.signal,
  });

  const text = await res.text();
  const data = parseJsonResponse(text);

  if (!res.ok) {
    throw new Error(text || `HTTP ${res.status}`);
  }

  const rate = Number(data?.['bitcoin-cash']?.usd);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('BCH/USD price response did not include a usable rate.');
  }
  return rate;
}

function authHeaders(secret) {
  return {
    'Content-Type': 'application/json',
    'x-sideshift-secret': secret,
  };
}

/**
 * Whether SideShift allows shifts from the caller's IP (GET /v2/permissions).
 * Endpoint is unauthenticated and keyed on client IP; no secret is involved.
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<boolean>}
 */
export async function fetchCreateShiftPermission(options = {}) {
  const res = await fetch(`${SIDESHIFT_API_V2}/permissions`, {
    method: 'GET',
    signal: options.signal,
  });

  const text = await res.text();
  const data = parseJsonResponse(text);

  if (!res.ok) {
    const msg = httpErrorMessage(data, text || `HTTP ${res.status}`);
    throw new Error(msg);
  }

  if (typeof data?.createShift !== 'boolean') {
    throw new Error('SideShift permissions response did not include createShift.');
  }

  return data.createShift;
}

/**
 * @param {{ secret: string; affiliateId: string }} credentials
 */
export async function createFixedBchShift(paymentRequest, credentials, options = {}) {
  if (!credentials?.secret || !credentials?.affiliateId) {
    throw new Error(
      'Add your SideShift private key and account ID from https://sideshift.ai/account (keys stay in this browser only).',
    );
  }

  const quoteBody = {
    depositCoin: 'bch',
    settleCoin: paymentRequest.methodId,
    settleAmount: paymentRequest.amount,
    affiliateId: credentials.affiliateId,
    commissionRate: 0,
  };
  if (paymentRequest.networkId) {
    quoteBody.settleNetwork = paymentRequest.networkId;
  }

  const quoteRes = await fetch(`${SIDESHIFT_API_V2}/quotes`, {
    method: 'POST',
    headers: authHeaders(credentials.secret),
    body: JSON.stringify(quoteBody),
    signal: options.signal,
  });

  const quoteText = await quoteRes.text();
  const quoteData = parseJsonResponse(quoteText);

  if (!quoteRes.ok) {
    const msg = httpErrorMessage(quoteData, quoteText || `HTTP ${quoteRes.status}`);
    const bchUsdRate = await fetchBchUsdRate({ signal: options.signal }).catch(() => null);
    throw new Error(enrichSideshiftAmountErrorMessage(msg, paymentRequest, { bchUsdRate }));
  }

  const quoteId = quoteData?.id;
  if (!quoteId) {
    throw new Error('SideShift quote response did not include an id.');
  }

  const shiftBody = {
    quoteId,
    settleAddress: paymentRequest.address,
    affiliateId: credentials.affiliateId,
  };
  if (paymentRequest.settleMemo) {
    shiftBody.settleMemo = paymentRequest.settleMemo;
  }

  const shiftRes = await fetch(`${SIDESHIFT_API_V2}/shifts/fixed`, {
    method: 'POST',
    headers: authHeaders(credentials.secret),
    body: JSON.stringify(shiftBody),
    signal: options.signal,
  });

  const shiftText = await shiftRes.text();
  const shiftData = parseJsonResponse(shiftText);

  if (!shiftRes.ok) {
    const msg = httpErrorMessage(shiftData, shiftText || `HTTP ${shiftRes.status}`);
    throw new Error(msg);
  }

  return normalizeShift(shiftData);
}

/**
 * Bulk shift fetch via GET /v2/shifts?ids=... (see bulkshifts docs).
 * Unauthenticated — any caller who knows the shift id can read it.
 * Returns an array of normalized shift objects, in the same order SideShift returns them.
 * Chunks requests so the URL stays reasonable for large histories.
 * @param {string[]} shiftIds
 */
export async function fetchShiftsBulk(shiftIds, options = {}) {
  const unique = Array.from(new Set((shiftIds || []).filter((id) => typeof id === 'string' && id)));
  if (unique.length === 0) {
    return [];
  }

  const CHUNK = 50;
  const results = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const url = `${SIDESHIFT_API_V2}/shifts?ids=${encodeURIComponent(chunk.join(','))}`;
    const res = await fetch(url, {
      method: 'GET',
      signal: options.signal,
    });

    const text = await res.text();
    const data = parseJsonResponse(text);

    if (!res.ok) {
      const msg = httpErrorMessage(data, text || `HTTP ${res.status}`);
      throw new Error(msg);
    }

    if (Array.isArray(data)) {
      for (const shift of data) {
        results.push(normalizeShift(shift));
      }
    }
  }
  return results;
}

/**
 * Unauthenticated — any caller who knows the shift id can read it.
 */
export async function fetchShiftStatus(shiftId, options = {}) {
  const res = await fetch(`${SIDESHIFT_API_V2}/shifts/${encodeURIComponent(shiftId)}`, {
    method: 'GET',
    signal: options.signal,
  });

  const text = await res.text();
  const data = parseJsonResponse(text);

  if (!res.ok) {
    const msg = httpErrorMessage(data, text || `HTTP ${res.status}`);
    throw new Error(msg);
  }

  return normalizeShift(data);
}

function normalizeShift(data) {
  if (!data || typeof data !== 'object') {
    return {};
  }

  return {
    ...data,
    id: data.id,
    orderId: data.id,
    depositAddress: data.depositAddress,
    depositAmount: data.depositAmount,
    depositMemo: data.depositMemo,
    settleAmount: data.settleAmount,
    settleCoin: data.settleCoin,
    status: data.status,
  };
}
