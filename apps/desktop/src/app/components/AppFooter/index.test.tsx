import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  integrationLabel,
  type IntegrationGlyphProvider,
} from '../../../features/integrations/components/IntegrationGlyph';
import { FOOTER_INTEGRATIONS } from './categories';

const { flags, storeState } = vi.hoisted(() => ({
  flags: { unseenRelease: false },
  storeState: {
    providers: [] as ReadonlyArray<{ readonly connection: string }>,
    updaterStatus: 'idle' as 'idle' | 'available' | 'downloading',
    updateVersion: '0.2.0' as string | null,
    installUpdate: vi.fn(async () => undefined),
  },
}));

vi.mock('../../../store', () => ({
  useAppStore: <T,>(selector: (state: typeof storeState) => T) => selector(storeState),
}));

vi.mock('../../../features/changelog/hooks/useUnseenRelease', () => ({
  useUnseenRelease: () => flags.unseenRelease,
}));

beforeEach(() => {
  flags.unseenRelease = false;
  storeState.providers = [];
  storeState.updaterStatus = 'idle';
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

import { AppFooter } from './index';
import { shortcutGlyphs } from '../../../shared/keyboard/registry';

const SETTINGS_LABEL = `Open settings (${shortcutGlyphs('settings.open')})`;
const REST_MORE_LABEL = 'More studios: impact and changelog';

const footerRow = () => screen.getByTestId('beta-badge-trigger').closest('.grid');

const openMore = () => {
  fireEvent.click(screen.getByRole('button', { name: /^More studios/ }));
  return screen.getByRole('dialog', { name: 'More studios' });
};

type FooterProps = ComponentProps<typeof AppFooter>;

type Params = {
  readonly overrides?: Partial<FooterProps>;
};

const footerProps = ({ overrides = {} }: Params = {}): FooterProps => ({
  activeStudio: null,
  onOpenWorkflows: vi.fn(),
  onOpenProviders: vi.fn(),
  onOpenSettings: vi.fn(),
  onOpenImpact: vi.fn(),
  onOpenChangelog: vi.fn(),
  onOpenInbox: vi.fn(),
  onOpenGithub: vi.fn(),
  onOpenLinear: vi.fn(),
  onOpenJira: vi.fn(),
  onOpenSentry: vi.fn(),
  onOpenGitlab: vi.fn(),
  onOpenBitbucket: vi.fn(),
  onOpenSlack: vi.fn(),
  githubEnabled: false,
  linearEnabled: false,
  jiraEnabled: false,
  sentryEnabled: false,
  gitlabEnabled: false,
  bitbucketEnabled: false,
  slackEnabled: false,
  ...overrides,
});

const openerSpies = () => ({
  github: vi.fn(),
  gitlab: vi.fn(),
  bitbucket: vi.fn(),
  linear: vi.fn(),
  jira: vi.fn(),
  sentry: vi.fn(),
  slack: vi.fn(),
});

type RoutingParams = {
  readonly spies: ReturnType<typeof openerSpies>;
  readonly connected: boolean;
};

const routingProps = ({ spies, connected }: RoutingParams): FooterProps =>
  footerProps({
    overrides: {
      onOpenGithub: spies.github,
      onOpenGitlab: spies.gitlab,
      onOpenBitbucket: spies.bitbucket,
      onOpenLinear: spies.linear,
      onOpenJira: spies.jira,
      onOpenSentry: spies.sentry,
      onOpenSlack: spies.slack,
      githubEnabled: connected,
      gitlabEnabled: connected,
      bitbucketEnabled: connected,
      linearEnabled: connected,
      jiraEnabled: connected,
      sentryEnabled: connected,
      slackEnabled: connected,
    },
  });

type ExpectRoutedParams = {
  readonly spies: ReturnType<typeof openerSpies>;
  readonly provider: IntegrationGlyphProvider;
};

const expectRoutedOnlyTo = ({ spies, provider }: ExpectRoutedParams) => {
  FOOTER_INTEGRATIONS.forEach(({ provider: candidate }) => {
    expect(
      spies[candidate].mock.calls.length,
      `${candidate} opener while ${provider} was picked`,
    ).toBe(candidate === provider ? 1 : 0);
  });
};

describe('AppFooter', () => {
  it('keeps inbox, workflows, providers and settings one click away on the right', () => {
    const onOpenInbox = vi.fn();
    const onOpenWorkflows = vi.fn();
    const onOpenProviders = vi.fn();
    const onOpenSettings = vi.fn();
    render(
      <AppFooter
        {...footerProps({
          overrides: { onOpenInbox, onOpenWorkflows, onOpenProviders, onOpenSettings },
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open the inbox for this workspace' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Open the workflow library for this workspace' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Connect and manage your provider accounts' }),
    );
    fireEvent.click(screen.getByRole('button', { name: SETTINGS_LABEL }));

    expect(onOpenInbox).toHaveBeenCalledOnce();
    expect(onOpenWorkflows).toHaveBeenCalledOnce();
    expect(onOpenProviders).toHaveBeenCalledOnce();
    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole('button', {
        name: 'See how orchestration changed the way this workspace works, and what it spends',
      }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'See what changed, release by release' }),
    ).toBeNull();
  });

  it('routes impact and changelog through the more menu', () => {
    const onOpenImpact = vi.fn();
    const onOpenChangelog = vi.fn();
    const { rerender } = render(
      <AppFooter {...footerProps({ overrides: { onOpenImpact, onOpenChangelog } })} />,
    );

    const menu = openMore();
    expect(within(menu).getAllByRole('button')).toHaveLength(2);
    expect(within(menu).queryByRole('button', { name: /budget/i })).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });

    fireEvent.click(
      within(openMore()).getByRole('button', {
        name: 'See how orchestration changed the way this workspace works, and what it spends',
      }),
    );
    expect(onOpenImpact).toHaveBeenCalledOnce();

    fireEvent.click(
      within(openMore()).getByRole('button', { name: 'See what changed, release by release' }),
    );
    expect(onOpenChangelog).toHaveBeenCalledOnce();

    rerender(<AppFooter {...footerProps({ overrides: { activeStudio: 'impact' } })} />);
    expect(screen.getByRole('button', { name: /^More studios/ }).className).toContain(
      'bg-muted text-foreground',
    );
  });

  it('closes the more menu on escape', () => {
    render(<AppFooter {...footerProps()} />);

    openMore();
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'More studios' })).toBeNull();
  });

  it('never dots the more control, release notes announce themselves elsewhere', () => {
    const { rerender } = render(<AppFooter {...footerProps()} />);

    expect(screen.queryByTestId('more-studios-dot')).toBeNull();

    flags.unseenRelease = true;
    rerender(<AppFooter {...footerProps()} />);

    expect(screen.queryByTestId('more-studios-dot')).toBeNull();
    expect(screen.getByRole('button', { name: REST_MORE_LABEL })).toBeDefined();
  });

  it('shows the update control only while an update is pending', () => {
    const { rerender } = render(<AppFooter {...footerProps()} />);

    expect(screen.queryByTestId('update-indicator')).toBeNull();

    storeState.updaterStatus = 'available';
    rerender(<AppFooter {...footerProps()} />);

    expect(screen.getByTestId('update-indicator').textContent).toContain('Update to 0.2.0');
  });

  it('orders the right cluster as inbox, workflows, providers, settings, more', () => {
    storeState.updaterStatus = 'available';
    render(<AppFooter {...footerProps()} />);

    const row = footerRow();
    const cluster = row?.children[2];
    const buttons = Array.from(cluster?.querySelectorAll('button') ?? []).filter(
      (button) => button.closest('dialog') == null,
    );
    const names = buttons.map((button) => button.getAttribute('aria-label') ?? button.textContent);

    expect(names).toEqual([
      'Open the inbox for this workspace',
      'Open the workflow library for this workspace',
      'Connect and manage your provider accounts',
      SETTINGS_LABEL,
      REST_MORE_LABEL,
    ]);
  });

  it('parks the update call to action next to the beta pill', () => {
    storeState.updaterStatus = 'available';
    render(<AppFooter {...footerProps()} />);

    const center = footerRow()?.children[1];

    expect(center?.contains(screen.getByTestId('beta-badge-trigger'))).toBe(true);
    expect(center?.contains(screen.getByTestId('update-indicator'))).toBe(true);
  });

  it('pulses the providers launcher until a provider connects, and never while its studio is open', () => {
    const { rerender } = render(<AppFooter {...footerProps()} />);
    const providers = () =>
      screen.getByRole('button', { name: 'Connect and manage your provider accounts' });

    expect(providers().className).toContain('motion-safe:animate-soft-pulse');

    rerender(<AppFooter {...footerProps({ overrides: { activeStudio: 'provider' } })} />);
    expect(providers().className).not.toContain('animate-soft-pulse');

    storeState.providers = [{ connection: 'connected' }];
    rerender(<AppFooter {...footerProps()} />);
    expect(providers().className).not.toContain('animate-soft-pulse');
  });

  it('lays the row out as three grid regions so the beta badge cannot overlap a cluster', () => {
    render(<AppFooter {...footerProps()} />);

    const beta = screen.getByTestId('beta-badge-trigger');
    const row = footerRow();

    expect(row?.className).toContain('grid');
    expect(row?.className).toContain('grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]');
    expect(beta.className).not.toContain('absolute');
    expect(row?.children.length).toBe(3);
  });

  it('keeps studio buttons muted at rest and gives the active one a subtle surface', () => {
    render(<AppFooter {...footerProps({ overrides: { activeStudio: 'workflow' } })} />);

    const settings = screen.getByRole('button', { name: SETTINGS_LABEL });
    const workflows = screen.getByRole('button', {
      name: 'Open the workflow library for this workspace',
    });

    expect(settings.className).toContain('text-muted-foreground');
    expect(workflows.className).toContain('bg-muted text-foreground');
  });

  it('gives settings the muted active fill instead of the inversion it had in the top bar', () => {
    render(<AppFooter {...footerProps({ overrides: { activeStudio: 'settings' } })} />);

    const settings = screen.getByRole('button', { name: SETTINGS_LABEL });

    expect(settings.className).toContain('bg-muted text-foreground');
    expect(settings.className).not.toContain('bg-foreground text-background');
  });

  it('invites the first connection when the workspace has none', () => {
    render(<AppFooter {...footerProps()} />);

    expect(screen.getByRole('group', { name: 'Connected integrations' }).children.length).toBe(0);
    expect(screen.getByRole('button', { name: 'Link your first integration' })).toBeDefined();
  });

  it('renders a few connected integrations as named glyphs that open their studios', () => {
    const onOpenGithub = vi.fn();
    render(
      <AppFooter
        {...footerProps({ overrides: { githubEnabled: true, linearEnabled: true, onOpenGithub } })}
      />,
    );

    const connected = screen.getByRole('group', { name: 'Connected integrations' });
    const github = within(connected).getByRole('button', { name: 'GitHub' });

    expect(github.textContent).toBe('');
    expect(within(connected).getByRole('button', { name: 'Linear' })).toBeDefined();
    expect(within(connected).getAllByRole('button').length).toBe(2);

    fireEvent.click(github);
    expect(onOpenGithub).toHaveBeenCalledOnce();
  });

  it('reaches every integration through the single link popover', () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    const onOpenGitlab = vi.fn();
    render(<AppFooter {...footerProps({ overrides: { githubEnabled: true, onOpenGitlab } })} />);

    expect(screen.queryByRole('button', { name: 'Connect GitLab' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Link integration' }));

    const panel = screen.getByRole('dialog', { name: 'Integrations' });
    expect(within(panel).getByRole('button', { name: 'Open GitHub' })).toBeDefined();
    expect(within(panel).getByRole('button', { name: 'Connect Bitbucket' })).toBeDefined();

    fireEvent.click(within(panel).getByRole('button', { name: 'Connect GitLab' }));

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'goodboy:open-settings',
        detail: { scope: 'tools', tool: 'gitlab' },
      }),
    );
    dispatch.mockRestore();
    expect(screen.queryByRole('dialog', { name: 'Integrations' })).toBeNull();
  });

  it('names the connection state of every member in the popover', () => {
    render(<AppFooter {...footerProps({ overrides: { linearEnabled: true } })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Link integration' }));

    const panel = screen.getByRole('dialog', { name: 'Integrations' });
    expect(within(panel).getAllByRole('listitem').length).toBe(7);
    expect(within(panel).getAllByText('Not connected').length).toBe(6);
    expect(within(panel).getByText('Connected')).toBeDefined();
  });

  it('closes the popover on escape', () => {
    render(<AppFooter {...footerProps()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Link your first integration' }));
    expect(screen.getByRole('dialog', { name: 'Integrations' })).toBeDefined();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Integrations' })).toBeNull();
  });

  it('sends every connected glyph to its own studio and to no other', () => {
    FOOTER_INTEGRATIONS.forEach((member) => {
      const spies = openerSpies();
      render(<AppFooter {...routingProps({ spies, connected: true })} />);

      fireEvent.click(
        screen.getByRole('button', { name: integrationLabel({ provider: member.provider }) }),
      );

      expectRoutedOnlyTo({ spies, provider: member.provider });
      cleanup();
    });
  });

  it('sends every unconnected popover row to its own Tools settings form', () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    FOOTER_INTEGRATIONS.forEach((member) => {
      dispatch.mockClear();
      const spies = openerSpies();
      render(<AppFooter {...routingProps({ spies, connected: false })} />);
      fireEvent.click(screen.getByRole('button', { name: 'Link your first integration' }));
      fireEvent.click(
        within(screen.getByRole('dialog', { name: 'Integrations' })).getByRole('button', {
          name: member.connectLabel,
        }),
      );
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'goodboy:open-settings',
          detail: { scope: 'tools', tool: member.provider },
        }),
      );
      expect(Object.values(spies).every((spy) => spy.mock.calls.length === 0)).toBe(true);
      cleanup();
    });
    dispatch.mockRestore();
  });

  it('holds the active state on the link action for a disconnected open studio', () => {
    render(<AppFooter {...footerProps({ overrides: { activeStudio: 'sentry' } })} />);

    expect(screen.getByRole('button', { name: 'Link your first integration' }).className).toContain(
      'bg-muted text-foreground',
    );
  });

  it('moves that active state onto the glyph once the integration is connected', () => {
    render(
      <AppFooter
        {...footerProps({ overrides: { activeStudio: 'sentry', sentryEnabled: true } })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Sentry' }).className).toContain(
      'bg-muted text-foreground',
    );
    expect(screen.getByRole('button', { name: 'Link integration' }).className).toContain(
      'text-muted-foreground',
    );
  });

  it('keeps the link action reachable with many connected integrations', () => {
    render(<AppFooter {...routingProps({ spies: openerSpies(), connected: true })} />);

    expect(
      within(screen.getByRole('group', { name: 'Connected integrations' })).getAllByRole('button')
        .length,
    ).toBe(7);
    fireEvent.click(screen.getByRole('button', { name: 'Link integration' }));
    expect(screen.getByRole('dialog', { name: 'Integrations' })).toBeDefined();
  });

  it('keeps Slack reachable whether or not it is connected', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const onOpenSlack = vi.fn();
    const { rerender } = render(<AppFooter {...footerProps({ overrides: { onOpenSlack } })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Link your first integration' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Integrations' })).getByRole('button', {
        name: 'Connect Slack',
      }),
    );
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'goodboy:open-settings',
        detail: { scope: 'tools', tool: 'slack' },
      }),
    );
    dispatchSpy.mockRestore();

    rerender(<AppFooter {...footerProps({ overrides: { slackEnabled: true, onOpenSlack } })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Slack' }));

    expect(onOpenSlack).toHaveBeenCalledOnce();
  });
});
