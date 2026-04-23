const SIDESHIFT_API_V2 = 'https://sideshift.ai/api/v2';

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

/**
 * SideShift min/max deposit errors often end with a bare number; fixed BCH→* quotes use BCH as deposit.
 * Settle-side errors refer to the scanned payment amount (paymentRequest currency).
 */
export function enrichSideshiftAmountErrorMessage(message, paymentRequest) {
  if (!message || !paymentRequest?.currencyCode) {
    return message;
  }

  const s = String(message).trim();
  const { currencyCode } = paymentRequest;

  const depositLow = /^Amount too low\. Minimum deposit amount:\s*([\d.eE+-]+)\s*$/i;
  const depositHigh = /^Amount too high\. Maximum deposit amount:\s*([\d.eE+-]+)\s*$/i;

  if ((depositLow.test(s) || depositHigh.test(s)) && !/\bBCH\b/i.test(s)) {
    // API sometimes ends the numeric amount with a full stop; avoid "... 0.01. BCH".
    const base = s.replace(/\.\s*$/, '');
    return `${base} BCH`;
  }

  return message;
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

  const quoteRes = await fetch(`${SIDESHIFT_API_V2}/quotes`, {
    method: 'POST',
    headers: authHeaders(credentials.secret),
    body: JSON.stringify({
      depositCoin: 'bch',
      settleCoin: paymentRequest.methodId,
      settleAmount: paymentRequest.amount,
      affiliateId: credentials.affiliateId,
      commissionRate: 0,
    }),
    signal: options.signal,
  });

  const quoteText = await quoteRes.text();
  const quoteData = parseJsonResponse(quoteText);

  if (!quoteRes.ok) {
    const msg = httpErrorMessage(quoteData, quoteText || `HTTP ${quoteRes.status}`);
    throw new Error(enrichSideshiftAmountErrorMessage(msg, paymentRequest));
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
 * Returns an array of normalized shift objects, in the same order SideShift returns them.
 * Chunks requests so the URL stays reasonable for large histories.
 * @param {string[]} shiftIds
 * @param {{ secret: string; affiliateId: string }} credentials
 */
export async function fetchShiftsBulk(shiftIds, credentials, options = {}) {
  if (!credentials?.secret) {
    throw new Error('SideShift private key is missing.');
  }

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
      headers: { 'x-sideshift-secret': credentials.secret },
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
 * @param {{ secret: string; affiliateId: string }} credentials
 */
export async function fetchShiftStatus(shiftId, credentials, options = {}) {
  if (!credentials?.secret) {
    throw new Error('SideShift private key is missing.');
  }

  const res = await fetch(`${SIDESHIFT_API_V2}/shifts/${encodeURIComponent(shiftId)}`, {
    method: 'GET',
    headers: {
      'x-sideshift-secret': credentials.secret,
    },
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
