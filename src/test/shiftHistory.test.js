import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SHIFT_HISTORY_MAX_ENTRIES,
  SHIFT_HISTORY_STORAGE_PREFIX,
  appendShift,
  clearShifts,
  listShifts,
  removeShift,
  updateShift,
} from '../lib/shiftHistory.js';

describe('shiftHistory', () => {
  const store = new Map();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal(
      'localStorage',
      {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => {
          store.set(k, v);
        },
        removeItem: (k) => {
          store.delete(k);
        },
      },
      { replace: true },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('appends entries newest-first and scopes by affiliateId', () => {
    appendShift('acct-A', { id: 's1', status: 'waiting', createdAt: '2024-01-01T00:00:00Z' });
    appendShift('acct-A', { id: 's2', status: 'waiting', createdAt: '2024-01-02T00:00:00Z' });
    appendShift('acct-B', { id: 'other-1', status: 'waiting' });

    expect(listShifts('acct-A').map((e) => e.id)).toEqual(['s2', 's1']);
    expect(listShifts('acct-B').map((e) => e.id)).toEqual(['other-1']);
    expect(listShifts('unknown')).toEqual([]);
  });

  it('uses a per-affiliate storage key', () => {
    appendShift('acct-A', { id: 's1' });
    expect(store.has(`${SHIFT_HISTORY_STORAGE_PREFIX}acct-A`)).toBe(true);
    expect(store.has(`${SHIFT_HISTORY_STORAGE_PREFIX}acct-B`)).toBe(false);
  });

  it('dedupes on append so re-appending an id moves it to the front without duplicates', () => {
    appendShift('a', { id: 's1', status: 'waiting' });
    appendShift('a', { id: 's2', status: 'waiting' });
    appendShift('a', { id: 's1', status: 'settled' });

    const list = listShifts('a');
    expect(list.map((e) => e.id)).toEqual(['s1', 's2']);
    expect(list[0].status).toBe('settled');
  });

  it('caps stored entries at SHIFT_HISTORY_MAX_ENTRIES', () => {
    for (let i = 0; i < SHIFT_HISTORY_MAX_ENTRIES + 5; i++) {
      appendShift('a', { id: `id-${i}` });
    }
    expect(listShifts('a')).toHaveLength(SHIFT_HISTORY_MAX_ENTRIES);
  });

  it('updates matching entries with a shallow merge', () => {
    appendShift('a', { id: 's1', status: 'waiting', depositAmount: '0.1' });
    updateShift('a', 's1', { status: 'settled', settleAmount: '10' });

    expect(listShifts('a')[0]).toMatchObject({
      id: 's1',
      status: 'settled',
      depositAmount: '0.1',
      settleAmount: '10',
    });
  });

  it('removeShift drops a single entry', () => {
    appendShift('a', { id: 's1' });
    appendShift('a', { id: 's2' });
    removeShift('a', 's1');
    expect(listShifts('a').map((e) => e.id)).toEqual(['s2']);
  });

  it('clearShifts removes only the target affiliate', () => {
    appendShift('a', { id: 's1' });
    appendShift('b', { id: 's2' });
    clearShifts('a');
    expect(listShifts('a')).toEqual([]);
    expect(listShifts('b').map((e) => e.id)).toEqual(['s2']);
  });

  it('ignores entries without a string id', () => {
    appendShift('a', { status: 'waiting' });
    appendShift('a', null);
    expect(listShifts('a')).toEqual([]);
  });

  it('returns [] for corrupt stored data', () => {
    store.set(`${SHIFT_HISTORY_STORAGE_PREFIX}a`, 'not-json');
    expect(listShifts('a')).toEqual([]);
  });
});
