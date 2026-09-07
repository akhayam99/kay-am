import { describe, expect, it, vi } from 'vitest';
import { createResolveCandidateWriter } from './index';

describe('resolve candidate persistence', () => {
  it('ignores ordinary greater-than text and coalesces a burst of marker endings', async () => {
    const persist = vi.fn(async () => undefined);
    const writer = createResolveCandidateWriter({ persist });
    writer.append({ delta: '> quote' });
    writer.append({ delta: 'a > b' });
    await writer.flush();
    expect(persist).not.toHaveBeenCalled();
    writer.append({ delta: 'marker>>' });
    writer.append({ delta: 'another>>' });
    writer.append({ delta: 'last>>' });
    await writer.flush();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('saves the latest text once more when markers arrive during an in-flight write', async () => {
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const saved: string[] = [];
    let text = 'first>>';
    let inFlight = 0;
    let maximumInFlight = 0;
    const writer = createResolveCandidateWriter({
      persist: async () => {
        inFlight += 1;
        maximumInFlight = Math.max(maximumInFlight, inFlight);
        saved.push(text);
        await gate;
        inFlight -= 1;
      },
    });
    writer.append({ delta: text });
    await Promise.resolve();
    text = 'second>>';
    writer.append({ delta: text });
    text = 'third>>';
    writer.append({ delta: text });
    release();
    await writer.flush();
    expect(saved).toEqual(['first>>', 'third>>']);
    expect(maximumInFlight).toBe(1);
  });
});
