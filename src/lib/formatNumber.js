const enUs = new Intl.NumberFormat('en-US', {
  useGrouping: true,
  maximumFractionDigits: 20,
});

const enUsUsd2 = new Intl.NumberFormat('en-US', {
  useGrouping: true,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * en-US display for numeric values (e.g. 1234.567 -> "1,234.567").
 * Non-finite or non-numeric strings are returned unchanged (safe for "?", ids, memos).
 */
export function formatEnUsNumber(value) {
  if (value == null) {
    return '';
  }
  const s = String(value).trim();
  if (s === '?' || s === '') {
    return s;
  }
  const n = Number(s);
  if (!Number.isFinite(n)) {
    return s;
  }
  return enUs.format(n);
}

export function formatEnUsUsd2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return null;
  }
  return enUsUsd2.format(n);
}

/**
 * en-US long-form date/time for history lines (commas in numeric date parts, 12h clock).
 */
export function formatEnUsHistoryDate(isoString) {
  if (!isoString) {
    return '';
  }
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}
