// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Markdown } from '../components/Markdown';
import { RemoteImageLoaderProvider } from '../components/RemoteImage/RemoteImageLoaderProvider';
import { LocalImageLoaderProvider } from '../components/LocalImage/LocalImageLoaderProvider';

afterEach(cleanup);

const PNG_DATA_URI = 'data:image/png;base64,iVBORw0KGgo=';

describe('Markdown images', () => {
  it('degrades a local image to alt text with no local provider', () => {
    const { container } = render(<Markdown text="![local chart](out/chart.png)" />);
    expect(container.textContent).toBe('local chart');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it.each([
    'mailto:chart.png',
    'file:/out/chart.png',
    'javascript:chart.png',
    'custom:chart.png',
    '//example.com/chart.png',
  ])('degrades a non-path URL to alt text: %s', (url) => {
    const load = vi.fn();
    const { container } = render(
      <LocalImageLoaderProvider load={load}>
        <Markdown text={`![local chart](${url})`} />
      </LocalImageLoaderProvider>,
    );
    expect(container.textContent).toBe('local chart');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('resolves a local image only after clicking load', async () => {
    const load = vi.fn().mockResolvedValue(PNG_DATA_URI);
    render(
      <LocalImageLoaderProvider load={load}>
        <Markdown text="![chart](out/chart.png)" />
      </LocalImageLoaderProvider>,
    );
    expect(load).not.toHaveBeenCalled();
    expect(screen.getByText('Local image. Click to load.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Load image' }));
    expect((await screen.findByRole('img', { name: 'chart' })).getAttribute('src')).toBe(
      PNG_DATA_URI,
    );
    expect(load).toHaveBeenCalledWith({ url: 'out/chart.png' });
  });

  it('keeps the alt text when a local image cannot be loaded', async () => {
    const load = vi.fn().mockRejectedValue('image is unavailable');
    render(
      <LocalImageLoaderProvider load={load}>
        <Markdown text="![missing chart](out/chart.png)" />
      </LocalImageLoaderProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Load image' }));
    await screen.findByRole('button', { name: 'Try again' });
    expect(screen.getByText('missing chart')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('keeps data images direct and https images on the remote loader with a local loader present', async () => {
    const localLoad = vi.fn();
    const remoteLoad = vi.fn().mockResolvedValue(PNG_DATA_URI);
    render(
      <LocalImageLoaderProvider load={localLoad}>
        <RemoteImageLoaderProvider load={remoteLoad}>
          <Markdown text={`![chart](${PNG_DATA_URI})\n\n![remote](https://example.com/a.png)`} />
        </RemoteImageLoaderProvider>
      </LocalImageLoaderProvider>,
    );
    expect(screen.getByRole('img', { name: 'chart' }).getAttribute('src')).toBe(PNG_DATA_URI);
    fireEvent.click(screen.getByRole('button', { name: 'Load image' }));
    await screen.findByRole('img', { name: 'remote' });
    expect(remoteLoad).toHaveBeenCalledWith({ url: 'https://example.com/a.png' });
    expect(localLoad).not.toHaveBeenCalled();
  });

  it('emits no remote src for an http image and names its host instead', () => {
    const { container } = render(
      <Markdown text="![the failing board](https://evil.example.com/track/abc.png)" />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('evil.example.com/track/abc.png');
    expect(container.textContent).toContain('evil.example.com');
    expect(container.textContent).toContain('the failing board');
  });

  it('renders a data image directly, since it reaches no host', () => {
    const { container } = render(<Markdown text={`![chart](${PNG_DATA_URI})`} />);

    const image = container.querySelector('img');
    expect(image?.getAttribute('src')).toBe(PNG_DATA_URI);
    expect(image?.getAttribute('alt')).toBe('chart');
  });

  it('refuses a data image that carries markup, as the backend does', () => {
    const { container } = render(
      <Markdown text={'![shape](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)'} />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('svg');
    expect(container.textContent).toContain('shape');
  });

  it('leaves a relative image alone', () => {
    const { container } = render(<Markdown text="![diagram](./docs/diagram.png)" />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('diagram');
  });

  it('loads one image in place on click and never before it', async () => {
    const load = vi.fn().mockResolvedValue(PNG_DATA_URI);
    const { container } = render(
      <RemoteImageLoaderProvider load={load}>
        <Markdown text="![board](https://example.com/one.png)" />
      </RemoteImageLoaderProvider>,
    );

    expect(load).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Load image' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith({ url: 'https://example.com/one.png' });
    expect(container.querySelector('img')?.getAttribute('src')).toBe(PNG_DATA_URI);
  });

  it('keeps a body with two hosts at two separate decisions', () => {
    const load = vi.fn();
    render(
      <RemoteImageLoaderProvider load={load}>
        <Markdown
          text={'![a](https://one.example.com/a.png)\n\n![b](https://two.example.com/b.png)'}
        />
      </RemoteImageLoaderProvider>,
    );

    expect(screen.getAllByRole('button', { name: 'Load image' })).toHaveLength(2);
    expect(screen.getByText('one.example.com')).toBeTruthy();
    expect(screen.getByText('two.example.com')).toBeTruthy();
  });

  it('shows the alt text alone in the compact preview variant', () => {
    const { container } = render(
      <Markdown variant="preview" text="![the failing board](https://example.com/a.png)" />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
    expect(container.textContent).toContain('the failing board');
  });
});
