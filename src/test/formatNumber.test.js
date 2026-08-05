import { describe, expect, it } from 'vitest';

import { formatEnUsHistoryDate, formatEnUsNumber, formatEnUsUsd2 } from '../lib/formatNumber.js';

describe('formatEnUsNumber', () => {
  it('adds thousands separators and preserves decimals from string input', () => {
    expect(formatEnUsNumber('1234.567')).toBe('1,234.567');
  });

  it('leaves ? and non-numeric text unchanged', () => {
    expect(formatEnUsNumber('?')).toBe('?');
    expect(formatEnUsNumber('n/a')).toBe('n/a');
  });
});

describe('formatEnUsUsd2', () => {
  it('formats to two fraction digits with grouping', () => {
    expect(formatEnUsUsd2(6000)).toBe('6,000.00');
  });
});

describe('formatEnUsHistoryDate', () => {
  it('uses en-US and includes a comma in the numeric date section', () => {
    const s = formatEnUsHistoryDate('2024-01-15T12:00:00.000Z');
    expect(s).toBeTruthy();
    expect(s).toMatch(/, \d{4},/);
    expect(s).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });
});
