import { describe, expect, it } from 'vitest';

import {
  isWalletPaymentStatus,
  isTerminalStatus,
  shouldShowDepositDetected,
  terminalShiftStatusMessage,
} from '../lib/shiftStatus.js';

describe('shift status helpers', () => {
  it('treats settled, expired, and refunded as terminal', () => {
    expect(isTerminalStatus('settled')).toBe(true);
    expect(isTerminalStatus('expired')).toBe(true);
    expect(isTerminalStatus('refunded')).toBe(true);
  });

  it('does not treat intermediate or empty statuses as terminal', () => {
    expect(isTerminalStatus('waiting')).toBe(false);
    expect(isTerminalStatus('pending')).toBe(false);
    expect(isTerminalStatus('')).toBe(false);
  });

  it('only allows wallet payment while a shift is waiting', () => {
    expect(isWalletPaymentStatus('waiting')).toBe(true);
    expect(isWalletPaymentStatus('confirming')).toBe(false);
    expect(isWalletPaymentStatus('settled')).toBe(false);
    expect(isWalletPaymentStatus('expired')).toBe(false);
    expect(isWalletPaymentStatus('refunded')).toBe(false);
    expect(isWalletPaymentStatus('')).toBe(false);
  });

  it('only shows deposit detected for waiting to non-terminal progress', () => {
    expect(shouldShowDepositDetected('waiting', 'confirming')).toBe(true);
    expect(shouldShowDepositDetected('waiting', 'settled')).toBe(false);
    expect(shouldShowDepositDetected('waiting', 'expired')).toBe(false);
    expect(shouldShowDepositDetected('waiting', 'refunded')).toBe(false);
  });

  it('returns final status messages for terminal statuses', () => {
    expect(terminalShiftStatusMessage('settled')).toEqual({
      message: 'SideShift marked the shift as settled.',
      tone: 'success',
    });
    expect(terminalShiftStatusMessage('expired')).toEqual({
      message: 'SideShift marked the shift as expired.',
      tone: 'warning',
    });
    expect(terminalShiftStatusMessage('refunded')).toEqual({
      message: 'SideShift marked the shift as refunded.',
      tone: 'warning',
    });
    expect(terminalShiftStatusMessage('waiting')).toBeNull();
  });
});
