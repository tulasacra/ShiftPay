const TERMINAL_SHIFT_STATUSES = new Set(['settled', 'expired', 'refunded']);

function normalizeStatus(status) {
  return String(status || '').toLowerCase();
}

export function isTerminalStatus(status) {
  return TERMINAL_SHIFT_STATUSES.has(normalizeStatus(status));
}

export function isWalletPaymentStatus(status) {
  return normalizeStatus(status) === 'waiting';
}

export function shouldShowDepositDetected(previousStatus, nextStatus) {
  const previous = normalizeStatus(previousStatus);
  const next = normalizeStatus(nextStatus);
  return previous === 'waiting' && next !== '' && next !== 'waiting' && !isTerminalStatus(next);
}

export function terminalShiftStatusMessage(status) {
  const normalized = normalizeStatus(status);
  if (normalized === 'settled') {
    return { message: 'SideShift marked the shift as settled.', tone: 'success' };
  }
  if (normalized === 'expired') {
    return { message: 'SideShift marked the shift as expired.', tone: 'warning' };
  }
  if (normalized === 'refunded') {
    return { message: 'SideShift marked the shift as refunded.', tone: 'warning' };
  }
  return null;
}
