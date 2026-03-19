export function sideshiftApiBase() {
  const custom = import.meta.env.VITE_SIDESHIFT_API_BASE;
  if (custom) {
    return String(custom).replace(/\/$/, '');
  }
  const base = import.meta.env.BASE_URL || '/';
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return `${normalized}api/sideshift`;
}

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

export async function createFixedBchShift(paymentRequest, options = {}) {
  const base = sideshiftApiBase();
  const res = await fetch(`${base}/fixed-shift`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      settleCoin: paymentRequest.methodId,
      settleAmount: paymentRequest.amount,
      settleAddress: paymentRequest.address,
    }),
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

export async function fetchShiftStatus(shiftId, options = {}) {
  const base = sideshiftApiBase();
  const res = await fetch(`${base}/shifts/${encodeURIComponent(shiftId)}`, {
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
