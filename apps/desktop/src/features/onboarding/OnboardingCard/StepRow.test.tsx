import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StepRow } from './StepRow';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('StepRow', () => {
  it.each([
    { id: 'tools', tool: 'linear' },
    { id: 'codeHost', tool: 'github' },
  ] satisfies ReadonlyArray<{ id: 'tools' | 'codeHost'; tool: string }>)(
    'opens Tools settings for the $id step',
    ({ id, tool }) => {
      const dispatch = vi.spyOn(window, 'dispatchEvent');
      render(<StepRow id={id} title="Tools" why="Connect your tools" done={false} />);
      fireEvent.click(screen.getByRole('button', { name: 'Set up Tools' }));
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'goodboy:open-settings',
          detail: { scope: 'tools', tool },
        }),
      );
    },
  );
});
