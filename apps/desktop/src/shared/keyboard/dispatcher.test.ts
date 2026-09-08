// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { platform } = vi.hoisted(() => ({ platform: { current: 'darwin' as 'darwin' | 'linux' } }));

vi.mock('../platform', () => ({ currentPlatform: () => platform.current }));

import { eventMatches, registerShortcut } from './dispatcher';
import { SHORTCUTS } from './registry';

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) {
    cleanups.pop()?.();
  }
  document.body.innerHTML = '';
  platform.current = 'darwin';
});

const bind = (id: Parameters<typeof registerShortcut>[0], handler: () => void) => {
  cleanups.push(registerShortcut(id, handler));
};

const press = (init: KeyboardEventInit): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
};

describe('shortcut dispatcher on darwin', () => {
  beforeEach(() => {
    platform.current = 'darwin';
  });

  it('fires a shifted bracket, which the character-based matcher could never see', () => {
    const onPrev = vi.fn();
    bind('session.prev', onPrev);

    press({ key: '{', code: 'BracketLeft', metaKey: true, shiftKey: true });

    expect(onPrev).toHaveBeenCalledOnce();
  });

  it('fires an option letter, which macOS composes into another character', () => {
    const onAgents = vi.fn();
    bind('lens.agents', onAgents);

    press({ key: 'å', code: 'KeyA', metaKey: true, altKey: true });

    expect(onAgents).toHaveBeenCalledOnce();
  });

  it('still fires while the caret sits in a textarea', () => {
    const onPalette = vi.fn();
    bind('palette.open', onPalette);
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();

    press({ key: 'k', code: 'KeyK', metaKey: true });

    expect(onPalette).toHaveBeenCalledOnce();
  });

  it('leaves an unclaimed combo to the browser instead of swallowing it', () => {
    bind('palette.open', vi.fn());

    const event = press({ key: 'k', code: 'KeyK', metaKey: true, altKey: true });

    expect(event.defaultPrevented).toBe(false);
  });

  it('does not confuse two combos that differ only by a modifier', () => {
    const onResolve = vi.fn();
    const onReload = vi.fn();
    bind('lens.review', onResolve);
    bind('app.reload', onReload);

    press({ key: 'r', code: 'KeyR', metaKey: true });

    expect(onReload).toHaveBeenCalledOnce();
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('stops listening for a shortcut once its owner unmounts', () => {
    const onPalette = vi.fn();
    const off = registerShortcut('palette.open', onPalette);
    off();

    press({ key: 'k', code: 'KeyK', metaKey: true });

    expect(onPalette).not.toHaveBeenCalled();
  });

  it('matches on the physical code and every modifier', () => {
    expect(
      eventMatches(new KeyboardEvent('keydown', { code: 'KeyK', metaKey: true }), 'cmd+KeyK'),
    ).toBe(true);
    expect(
      eventMatches(
        new KeyboardEvent('keydown', { code: 'KeyK', metaKey: true, shiftKey: true }),
        SHORTCUTS['palette.open'].combo,
      ),
    ).toBe(false);
  });

  it('ignores the ctrl spelling of a combo, which belongs to the terminal here', () => {
    const onPalette = vi.fn();
    bind('palette.open', onPalette);

    press({ key: 'k', code: 'KeyK', ctrlKey: true });

    expect(onPalette).not.toHaveBeenCalled();
  });
});

describe('shortcut dispatcher off darwin', () => {
  beforeEach(() => {
    platform.current = 'linux';
  });

  it('fires the command plane on ctrl, which is the only modifier the platform sends', () => {
    const onPalette = vi.fn();
    bind('palette.open', onPalette);

    press({ key: 'k', code: 'KeyK', ctrlKey: true });

    expect(onPalette).toHaveBeenCalledOnce();
  });

  it('never fires on the command key, which no keyboard here carries', () => {
    const onPalette = vi.fn();
    bind('palette.open', onPalette);

    press({ key: 'k', code: 'KeyK', metaKey: true });

    expect(onPalette).not.toHaveBeenCalled();
  });

  it('keeps the session and lens planes on their own modifiers', () => {
    const onPrev = vi.fn();
    const onAgents = vi.fn();
    bind('session.prev', onPrev);
    bind('lens.agents', onAgents);

    press({ key: '{', code: 'BracketLeft', ctrlKey: true, shiftKey: true });
    press({ key: 'a', code: 'KeyA', ctrlKey: true, altKey: true });

    expect(onPrev).toHaveBeenCalledOnce();
    expect(onAgents).toHaveBeenCalledOnce();
  });

  it('still separates two combos that differ only by a modifier', () => {
    const onResolve = vi.fn();
    const onReload = vi.fn();
    bind('lens.review', onResolve);
    bind('app.reload', onReload);

    press({ key: 'r', code: 'KeyR', ctrlKey: true });

    expect(onReload).toHaveBeenCalledOnce();
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('resolves every registry combo to ctrl and never to the command key', () => {
    for (const entry of Object.values(SHORTCUTS)) {
      const code = entry.combo.split('+').at(-1) ?? '';
      const shiftKey = entry.combo.includes('shift');
      const altKey = entry.combo.includes('alt');
      expect(
        eventMatches(
          new KeyboardEvent('keydown', { code, ctrlKey: true, shiftKey, altKey }),
          entry.combo,
        ),
        `${entry.combo} does not resolve to ctrl`,
      ).toBe(true);
      expect(
        eventMatches(
          new KeyboardEvent('keydown', { code, metaKey: true, shiftKey, altKey }),
          entry.combo,
        ),
        `${entry.combo} still answers to the command key`,
      ).toBe(false);
    }
  });
});
