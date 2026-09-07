import { describe, expect, it, vi } from 'vitest';
import { hasImagePath } from './hasImagePath';

describe('hasImagePath', () => {
  it('finds paths in nested objects and arrays', () => {
    expect(hasImagePath({ data: { a: [{ b: { c: { d: ['out/chart.png'] } } }] } })).toBe(true);
  });

  it('handles arrays and objects larger than the argument limit', () => {
    const values = Array.from({ length: 200_000 }, () => null);
    expect(hasImagePath({ data: values })).toBe(false);
    expect(
      hasImagePath({ data: Object.fromEntries(values.map((value, index) => [index, value])) }),
    ).toBe(false);
  });

  it('stops reading child nodes once its budget is exhausted', () => {
    const readBeyondBudget = vi.fn(() => 'out/chart.png');
    const data = Array.from({ length: 20_000 }, () => null);
    Object.defineProperty(data, '15000', { get: readBeyondBudget });
    expect(hasImagePath({ data })).toBe(false);
    expect(readBeyondBudget).not.toHaveBeenCalled();
  });

  it('bounds deep traversal without recursing', () => {
    let data: unknown = 'out/chart.png';
    for (let depth = 0; depth < 20_000; depth += 1) {
      data = { child: data };
    }
    expect(hasImagePath({ data })).toBe(false);
  });

  it('terminates on cycles and finds other reachable images', () => {
    const data: Record<string, unknown> = {};
    data.self = data;
    expect(hasImagePath({ data })).toBe(false);
    data.image = 'out/chart.png';
    expect(hasImagePath({ data })).toBe(true);
  });

  it('ignores image extensions in logs, oversized strings and scheme URLs', () => {
    expect(
      hasImagePath({
        data: [
          `${'log line\n'.repeat(6400)}out/chart.png`,
          `${'a'.repeat(1021)}.png`,
          'a b.png',
          'file:/a.png',
          'https://example.com/a.png',
        ],
      }),
    ).toBe(false);
  });
});
