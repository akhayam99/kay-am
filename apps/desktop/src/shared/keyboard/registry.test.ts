import { afterEach, describe, expect, it, vi } from 'vitest';

const { platform } = vi.hoisted(() => ({ platform: { current: 'darwin' as 'darwin' | 'linux' } }));

vi.mock('../platform', () => ({ currentPlatform: () => platform.current }));

import { RESERVED_COMBOS, SHORTCUTS, formatCombo, shortcutGlyphs } from './registry';

const entries = Object.entries(SHORTCUTS);

afterEach(() => {
  platform.current = 'darwin';
});

describe('shortcut registry', () => {
  it('binds every combo exactly once', () => {
    const seen = new Map<string, string>();
    for (const [id, entry] of entries) {
      const clash = seen.get(entry.combo);
      expect(clash, `${id} and ${clash} both bind ${entry.combo}`).toBeUndefined();
      seen.set(entry.combo, id);
    }
  });

  it('gives the review lens exactly one chord', () => {
    const reviewLensIds = entries
      .filter(([id, entry]) => entry.plane === 'lens' && id.startsWith('lens.'))
      .filter(([, entry]) => entry.label === 'Review')
      .map(([id]) => id);

    expect(reviewLensIds).toEqual(['lens.review']);
  });

  it('never binds a combo macOS reserves, or the text field owns', () => {
    for (const [id, entry] of entries) {
      expect(RESERVED_COMBOS, `${id} binds the reserved ${entry.combo}`).not.toContain(entry.combo);
    }
  });

  it('spells every combo with a physical code, never a character', () => {
    for (const [id, entry] of entries) {
      const key = entry.combo.split('+').at(-1) ?? '';
      expect(
        /^(Key[A-Z]|Digit[0-9]|Comma|Period|Slash|Minus|Equal|BracketLeft|BracketRight|Backspace|Escape|Enter)$/.test(
          key,
        ),
        `${id} uses ${key}, which is a character rather than a key code`,
      ).toBe(true);
    }
  });

  it('keeps every combo on the modifier plane its entry claims', () => {
    for (const [id, entry] of entries) {
      const parts = entry.combo.split('+');
      const shape = `${parts.includes('shift') ? 'shift' : ''}${parts.includes('alt') ? 'alt' : ''}`;
      const expected = { app: '', session: 'shift', lens: 'alt' }[entry.plane];
      expect(shape, `${id} is on the ${entry.plane} plane but reads ${entry.combo}`).toBe(expected);
    }
  });

  it('renders combos as macOS glyphs on darwin', () => {
    platform.current = 'darwin';

    expect(shortcutGlyphs('palette.open')).toBe('⌘K');
    expect(shortcutGlyphs('session.delete')).toBe('⌘⇧⌫');
    expect(shortcutGlyphs('lens.agents')).toBe('⌘⌥A');
    expect(shortcutGlyphs('workspace.1')).toBe('⌘1');
    expect(formatCombo('cmd+BracketLeft')).toBe('⌘[');
    expect(formatCombo('cmd+Enter')).toBe('⌘↵');
  });

  it('renders combos as named ctrl keys off darwin', () => {
    platform.current = 'linux';

    expect(shortcutGlyphs('palette.open')).toBe('Ctrl+K');
    expect(shortcutGlyphs('session.delete')).toBe('Ctrl+Shift+Backspace');
    expect(shortcutGlyphs('lens.agents')).toBe('Ctrl+Alt+A');
    expect(shortcutGlyphs('workspace.1')).toBe('Ctrl+1');
    expect(formatCombo('cmd+BracketLeft')).toBe('Ctrl+[');
    expect(formatCombo('cmd+Enter')).toBe('Ctrl+Enter');
  });

  it('never shows the command glyph off darwin', () => {
    platform.current = 'linux';

    for (const [id, entry] of entries) {
      expect(formatCombo(entry.combo), `${id} still renders a macOS glyph`).not.toMatch(
        /[⌘⌥⇧⌃⌫⎋↵␣]/,
      );
    }
  });
});
