// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const { platform } = vi.hoisted(() => ({ platform: { current: 'darwin' as 'darwin' | 'linux' } }));

vi.mock('../../../../../shared/platform', () => ({ currentPlatform: () => platform.current }));

const mountComposer = async () => {
  vi.resetModules();
  const { LineComposer } = await import('./LineComposer');
  render(<LineComposer label="Line 12" onSubmit={() => undefined} onCancel={() => undefined} />);
};

afterEach(() => {
  cleanup();
  platform.current = 'darwin';
});

describe('LineComposer submit hint', () => {
  it('spells the submit combo with command glyphs on darwin', async () => {
    platform.current = 'darwin';
    await mountComposer();

    expect(screen.getByPlaceholderText('Draft a review comment… (⌘↵ to add)')).toBeTruthy();
  });

  it('spells the submit combo with named ctrl keys off darwin', async () => {
    platform.current = 'linux';
    await mountComposer();

    expect(screen.getByPlaceholderText('Draft a review comment… (Ctrl+Enter to add)')).toBeTruthy();
  });
});
