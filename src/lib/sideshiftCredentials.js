const STORAGE_KEY = 'shiftpay:sideshift-credentials-v1';

export function getStoredCredentials() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const data = JSON.parse(raw);
    if (data?.v !== 1 || typeof data.secret !== 'string' || typeof data.affiliateId !== 'string') {
      return null;
    }
    const secret = data.secret.trim();
    const affiliateId = data.affiliateId.trim();
    if (!secret || !affiliateId) {
      return null;
    }
    return { secret, affiliateId };
  } catch {
    return null;
  }
}

export function saveCredentials(secret, affiliateId) {
  const s = String(secret).trim();
  const a = String(affiliateId).trim();
  if (!s || !a) {
    throw new Error('Private key and account ID are required.');
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, secret: s, affiliateId: a }));
}

export function clearStoredCredentials() {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasStoredCredentials() {
  return getStoredCredentials() !== null;
}
