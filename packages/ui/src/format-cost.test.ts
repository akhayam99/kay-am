import { describe, expect, it } from 'vitest';
import { formatTokens, formatUsd } from './format-cost';

describe('formatTokens', () => {
  it('formats token counts across unit boundaries', () => {
    expect(formatTokens(999)).toBe('999');
    expect(formatTokens(1500)).toBe('1.5k');
    expect(formatTokens(50000)).toBe('50.0k');
    expect(formatTokens(1_500_000)).toBe('1.50M');
  });
});

describe('formatUsd', () => {
  it('formats values across precision boundaries', () => {
    expect(formatUsd(0)).toBe('$0');
    expect(formatUsd(0.005)).toBe('<$0.01');
    expect(formatUsd(0.5)).toBe('$0.50');
    expect(formatUsd(12.3)).toBe('$12.30');
  });

  it('keeps a column of costs on one number of decimals', () => {
    expect([0.02, 0.34, 0.75, 1.2, 4.82].map((usd) => formatUsd(usd))).toEqual([
      '$0.02',
      '$0.34',
      '$0.75',
      '$1.20',
      '$4.82',
    ]);
  });

  it('says a sub-cent amount is under a cent instead of rounding it away', () => {
    expect(formatUsd(0.0001)).toBe('<$0.01');
    expect(formatUsd(0.0099)).toBe('<$0.01');
  });
});
