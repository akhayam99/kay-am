// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TranscriptItem } from '../../utils/transcript-items';
import { ToolCallCard } from './index';
import { ChatImageLoaderProvider } from '../ChatView/ChatImageLoaderProvider';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

type ToolItem = Extract<TranscriptItem, { kind: 'tool_call' }>;

type Params = {
  readonly overrides?: Partial<ToolItem>;
};

const tool = ({ overrides = {} }: Params = {}): ToolItem => ({
  kind: 'tool_call',
  key: 'tool-1',
  toolUseId: '1',
  toolName: 'read',
  input: { path: '/foo.ts' },
  output: 'file content',
  isError: false,
  ended: true,
  ...overrides,
});

afterEach(() => {
  cleanup();
  invoke.mockReset();
});

describe('ToolCallCard', () => {
  it('stops structured expansion at a hard depth even when an image exists below it', () => {
    let input: unknown = { hiddenLeaf: 'out/deep.png' };
    for (let depth = 0; depth < 32; depth += 1) {
      input = { child: input };
    }
    render(
      <ChatImageLoaderProvider sessionId="session-1">
        <ToolCallCard item={tool({ overrides: { input } })} />
      </ChatImageLoaderProvider>,
    );
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.queryByRole('button', { name: 'Load image' })).toBeNull();
    expect(screen.queryByText('hiddenLeaf')).toBeNull();
    expect(document.querySelector('pre')?.textContent).toContain('out/deep.png');
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'collapses image-suffixed logs, including primitive arrays: %s',
    (isArray) => {
      const log = `${'log line\n'.repeat(6400)}out/chart.png`;
      render(
        <ChatImageLoaderProvider sessionId="session-1">
          <ToolCallCard item={tool({ overrides: { output: isArray ? [log] : log } })} />
        </ChatImageLoaderProvider>,
      );
      fireEvent.click(screen.getByRole('button', { expanded: false }));
      expect(screen.getByRole('button', { name: /chars/, expanded: false })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Load image' })).toBeNull();
      expect(screen.queryByRole('img')).toBeNull();
      expect(invoke).not.toHaveBeenCalled();
    },
  );

  it('renders image paths in deeply nested input', async () => {
    invoke.mockResolvedValue('data:image/png;base64,iVBORw0KGgo=');
    render(
      <ChatImageLoaderProvider sessionId="session-1">
        <ToolCallCard
          item={tool({
            overrides: { input: { a: { b: { c: { d: { path: 'out/chart.png' } } } } } },
          })}
        />
      </ChatImageLoaderProvider>,
    );
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Load image' }));
    expect(await screen.findByRole('img', { name: 'out/chart.png' })).toBeTruthy();
    expect(screen.getByText('out/chart.png')).toBeTruthy();
  });

  it('keeps image paths as text when no session is available', () => {
    invoke.mockClear();
    render(
      <ChatImageLoaderProvider sessionId={null}>
        <ToolCallCard item={tool({ overrides: { output: 'out/chart.png' } })} />
      </ChatImageLoaderProvider>,
    );
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('out/chart.png')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('loads a produced image thumbnail, preserves its path and opens the lightbox', async () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgo=';
    invoke.mockResolvedValue(dataUri);
    render(
      <ChatImageLoaderProvider sessionId="session-1">
        <ToolCallCard
          item={tool({
            overrides: { output: { files: ['/repo/out/chart.png', '/repo/out/report.txt'] } },
          })}
        />
      </ChatImageLoaderProvider>,
    );
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Load image' }));
    expect((await screen.findByRole('img')).getAttribute('src')).toBe(dataUri);
    expect(invoke).toHaveBeenCalledWith('local_image_read', {
      sessionId: 'session-1',
      path: '/repo/out/chart.png',
    });
    expect(screen.getByText('/repo/out/chart.png')).toBeTruthy();
    expect(screen.getByText('/repo/out/report.txt')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open image /repo/out/chart.png' }));
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('keeps non-image paths as text without reading files', () => {
    invoke.mockClear();
    render(
      <ChatImageLoaderProvider sessionId="session-1">
        <ToolCallCard item={tool({ overrides: { output: '/repo/out/report.txt' } })} />
      </ChatImageLoaderProvider>,
    );
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('/repo/out/report.txt')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('keeps refused image paths visible without a thumbnail', async () => {
    invoke.mockRejectedValue('image path escapes the selected root');
    render(
      <ChatImageLoaderProvider sessionId="session-1">
        <ToolCallCard item={tool({ overrides: { input: { path: '/outside/chart.png' } } })} />
      </ChatImageLoaderProvider>,
    );
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Load image' }));
    await screen.findByRole('button', { name: 'Try again' });
    expect(screen.getByText('/outside/chart.png')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders collapsed with tool name', () => {
    render(<ToolCallCard item={tool()} />);
    expect(screen.getByText('read')).toBeTruthy();
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false');
  });

  it('shows structured input and output when expanded', () => {
    render(<ToolCallCard item={tool()} />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('/foo.ts')).toBeTruthy();
    expect(screen.getByText('file content')).toBeTruthy();
  });

  it('pulses the state icon while running', () => {
    render(<ToolCallCard item={tool({ overrides: { ended: false, output: null } })} />);
    const icon = screen.getByTestId('tool-state-icon');
    expect(icon.getAttribute('class')).toContain('animate-pulse');
    expect(icon.getAttribute('class')).toContain('text-info');
  });

  it('colors the state icon green once it succeeded', () => {
    render(<ToolCallCard item={tool()} />);
    const icon = screen.getByTestId('tool-state-icon');
    expect(icon.getAttribute('class')).toContain('text-success');
    expect(icon.getAttribute('class')).not.toContain('animate-pulse');
  });

  it('colors the state icon red on error', () => {
    render(<ToolCallCard item={tool({ overrides: { isError: true } })} />);
    expect(screen.getByTestId('tool-state-icon').getAttribute('class')).toContain('text-danger');
  });

  it('has a single leading chevron as the expand affordance', () => {
    render(<ToolCallCard item={tool()} />);
    const chevron = screen.getByTestId('transcript-chevron');
    expect(chevron.getAttribute('class')).not.toContain('rotate-90');
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getAllByTestId('transcript-chevron')[0]!.getAttribute('class')).toContain(
      'rotate-90',
    );
  });

  it('shows error badge when isError', () => {
    render(<ToolCallCard item={tool({ overrides: { isError: true } })} />);
    expect(screen.getByText('error')).toBeTruthy();
  });

  it('appends the run duration to the header once the tool ends', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <ToolCallCard item={tool({ overrides: { ended: false, output: null } })} />,
    );
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    rerender(<ToolCallCard item={tool()} />);
    expect(screen.getByText('2s')).toBeTruthy();
    vi.useRealTimers();
  });

  it('toggles between structured and raw json', () => {
    render(<ToolCallCard item={tool()} />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByTestId('raw-toggle').textContent).toBe('raw json');
    fireEvent.click(screen.getByTestId('raw-toggle'));
    expect(screen.getByTestId('raw-toggle').textContent).toBe('structured');
  });

  it('does not render output when still running', () => {
    render(<ToolCallCard item={tool({ overrides: { ended: false, output: null } })} />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('/foo.ts')).toBeTruthy();
    expect(screen.queryByText('file content')).toBeNull();
  });

  it('shows raw JSON input and output in raw mode', () => {
    render(
      <ToolCallCard item={tool({ overrides: { input: { key: 'val' }, output: 'result' } })} />,
    );
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    fireEvent.click(screen.getByTestId('raw-toggle'));
    const pres = document.querySelectorAll('pre');
    expect(pres.length).toBe(2);
    expect(pres[0]!.textContent).toContain('"key"');
    expect(pres[0]!.textContent).toContain('"val"');
    expect(pres[1]!.textContent).toContain('result');
  });

  it('raw mode hides output when not ended', () => {
    render(<ToolCallCard item={tool({ overrides: { ended: false, output: null } })} />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    fireEvent.click(screen.getByTestId('raw-toggle'));
    const pres = document.querySelectorAll('pre');
    expect(pres.length).toBe(1);
  });

  it('handles null input gracefully', () => {
    render(<ToolCallCard item={tool({ overrides: { input: null, output: 'ok' } })} />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('null')).toBeTruthy();
  });

  it('renders nested object input in structured mode', () => {
    render(<ToolCallCard item={tool({ overrides: { input: { nested: { deep: true } } } })} />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('nested')).toBeTruthy();
    expect(screen.getByText('deep')).toBeTruthy();
    expect(screen.getByText('true')).toBeTruthy();
  });
});
