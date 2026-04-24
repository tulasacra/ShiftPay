const STORAGE_PREFIX = 'shiftpay:shift-history-v1:';
const MAX_ENTRIES = 100;

function storageKey(affiliateId) {
  return `${STORAGE_PREFIX}${affiliateId}`;
}

function safeParseArray(raw) {
  if (!raw) {
    return [];
  }
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function sanitizeEntry(entry) {
  if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || !entry.id) {
    return null;
  }
  return entry;
}

/**
 * Returns stored shift history entries for the given affiliate, newest first.
 * @param {string} affiliateId
 * @returns {Array<object>}
 */
export function listShifts(affiliateId) {
  if (!affiliateId) {
    return [];
  }
  return safeParseArray(localStorage.getItem(storageKey(affiliateId)))
    .map(sanitizeEntry)
    .filter(Boolean);
}

/**
 * Prepends a shift entry to this affiliate's history.
 * Deduplicates by `id` (newer entry wins) and caps the list at MAX_ENTRIES.
 * @param {string} affiliateId
 * @param {object} entry
 */
export function appendShift(affiliateId, entry) {
  const sanitized = sanitizeEntry(entry);
  if (!affiliateId || !sanitized) {
    return;
  }
  const key = storageKey(affiliateId);
  const existing = safeParseArray(localStorage.getItem(key)).filter(
    (e) => e && e.id !== sanitized.id,
  );
  const next = [sanitized, ...existing].slice(0, MAX_ENTRIES);
  localStorage.setItem(key, JSON.stringify(next));
}

/**
 * Updates fields on an existing history entry in place (merged), if present.
 * @param {string} affiliateId
 * @param {string} id
 * @param {object} patch
 */
export function updateShift(affiliateId, id, patch) {
  if (!affiliateId || !id || !patch) {
    return;
  }
  const key = storageKey(affiliateId);
  const list = safeParseArray(localStorage.getItem(key));
  let changed = false;
  const next = list.map((entry) => {
    if (entry && entry.id === id) {
      changed = true;
      return { ...entry, ...patch };
    }
    return entry;
  });
  if (changed) {
    localStorage.setItem(key, JSON.stringify(next));
  }
}

/**
 * Removes a single entry from this affiliate's history.
 * @param {string} affiliateId
 * @param {string} id
 */
export function removeShift(affiliateId, id) {
  if (!affiliateId || !id) {
    return;
  }
  const key = storageKey(affiliateId);
  const existing = safeParseArray(localStorage.getItem(key));
  const next = existing.filter((entry) => entry && entry.id !== id);
  if (next.length === existing.length) {
    return;
  }
  if (next.length === 0) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, JSON.stringify(next));
  }
}

/**
 * Drops all history entries for an affiliate.
 * @param {string} affiliateId
 */
export function clearShifts(affiliateId) {
  if (!affiliateId) {
    return;
  }
  localStorage.removeItem(storageKey(affiliateId));
}

export const SHIFT_HISTORY_STORAGE_PREFIX = STORAGE_PREFIX;
export const SHIFT_HISTORY_MAX_ENTRIES = MAX_ENTRIES;
