import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { OverrideSettings } from '@goodboy/types';
import { DefaultsPanel } from './index';

type SetWorkspaceOverrides = (workspaceId: string, overrides: OverrideSettings) => Promise<void>;

const { state } = vi.hoisted(() => ({
  state: {
    workspaceOverrides: {} as Record<string, OverrideSettings>,
    providers: [
      { id: 'anthropic', connection: 'connected' },
      { id: 'cursor', connection: 'connected' },
    ],
    setWorkspaceOverrides: vi.fn<SetWorkspaceOverrides>(async () => undefined),
  },
}));

vi.mock('../../../../../store', () => ({
  useAppStore: <T,>(selector: (store: typeof state) => T) => selector(state),
}));

vi.mock('../../ProviderChip', () => ({
  ProviderChip: ({
    id,
    selected,
    disabled,
    onClick,
  }: {
    id: string;
    selected: boolean;
    disabled: boolean;
    onClick: () => void;
  }) => (
    <button type="button" aria-pressed={selected} disabled={disabled} onClick={onClick}>
      {id}
    </button>
  ),
}));

vi.mock('../../../../../shared/components/RoutingPicker', () => ({
  RoutingPicker: ({
    ariaLabel,
    provider,
    model,
    effort,
    recommendation,
    onProvider,
    onModel,
    onReset,
  }: {
    ariaLabel: string;
    provider: string;
    model: string;
    effort: { editable: boolean; value?: string; onChange?: (level: string) => void };
    recommendation?: { provider?: string; model?: string };
    onProvider: (provider: string) => void;
    onModel: (model: string) => void;
    onReset?: () => void;
  }) => (
    <>
      <button
        type="button"
        aria-label={`${ariaLabel} provider`}
        onClick={() => onProvider('cursor')}
      >
        {provider}
      </button>
      <button
        type="button"
        aria-label={`${ariaLabel} model`}
        onClick={() => onModel('claude-sonnet-4-6')}
      >
        {model === '' ? (recommendation?.model ?? '') : model}
      </button>
      <button
        type="button"
        aria-label={`${ariaLabel} cheap model`}
        onClick={() => onModel('claude-haiku-4-5')}
      >
        pick haiku
      </button>
      <button
        type="button"
        aria-label={`${ariaLabel} high effort`}
        disabled={!effort.editable}
        onClick={() => effort.onChange?.('high')}
      >
        {effort.value ?? ''}
      </button>
      {onReset != null && (
        <button type="button" aria-label={`${ariaLabel} reset`} onClick={onReset}>
          reset
        </button>
      )}
    </>
  ),
}));

vi.mock('../../../../../shared/components/RoutingPicker/ProviderPicker', () => ({
  ProviderPicker: ({
    ariaLabel,
    provider,
    onProvider,
  }: {
    ariaLabel: string;
    provider: string;
    onProvider: (provider: string) => void;
  }) => (
    <button type="button" aria-label={ariaLabel} onClick={() => onProvider('cursor')}>
      {provider}
    </button>
  ),
}));

const EMPTY_OVERRIDES: OverrideSettings = {
  defaultProviderId: null,
  defaultWorkflowId: null,
  defaultBranchPrefix: null,
  parallelEnabled: null,
  defaultVerbosity: null,
  providerBindings: null,
  taskModels: null,
  roleModels: null,
  parallelAgents: null,
  providerPool: null,
  attributionFooter: null,
};

beforeEach(() => {
  state.workspaceOverrides = { 'ws-1': EMPTY_OVERRIDES };
  state.setWorkspaceOverrides.mockReset();
  state.setWorkspaceOverrides.mockImplementation(async (workspaceId, overrides) => {
    state.workspaceOverrides = {
      ...state.workspaceOverrides,
      [workspaceId]: overrides,
    };
  });
});

afterEach(cleanup);

const TASK_LABELS = [
  'Step summaries',
  'Branch naming',
  'Plan drafting',
  'Prose polish',
  'Agent naming',
  'Workflow orchestrator',
  'PR and MR drafts',
  'Rebase',
];

const openRolesTab = () => fireEvent.click(screen.getByRole('tab', { name: /Agent roles/ }));

describe('DefaultsPanel', () => {
  it('uses connected providers as the routing pool and locks the default', () => {
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);

    const anthropic = screen.getByRole('button', { name: 'anthropic' });
    const cursor = screen.getByRole('button', { name: 'cursor' });

    expect(anthropic.getAttribute('aria-pressed')).toBe('true');
    expect(anthropic.hasAttribute('disabled')).toBe(true);
    expect(cursor.getAttribute('aria-pressed')).toBe('true');
  });

  it('persists a restricted routing pool', () => {
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);

    fireEvent.click(screen.getByRole('button', { name: 'cursor' }));

    expect(state.setWorkspaceOverrides).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({ providerPool: ['anthropic'] }),
    );
  });

  it('adds a new default provider to a restricted routing pool', () => {
    state.workspaceOverrides = {
      'ws-1': { ...EMPTY_OVERRIDES, providerPool: ['anthropic'] },
    };
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);

    fireEvent.click(screen.getByRole('button', { name: 'Default provider' }));

    expect(state.setWorkspaceOverrides).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        defaultProviderId: 'cursor',
        providerPool: ['anthropic', 'cursor'],
      }),
    );
  });

  it('renders every task model row', () => {
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);

    for (const label of TASK_LABELS) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it('shows the resolved model for automatic task preferences, never the word auto', () => {
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);

    for (const label of TASK_LABELS) {
      expect(screen.getByRole('button', { name: `${label} routing model` }).textContent).toBe(
        label === 'Rebase' || label === 'Workflow orchestrator' ? 'sonnet-5' : 'haiku-4.5',
      );
    }
    expect(screen.queryByText(/auto/)).toBeNull();
    expect(screen.getByLabelText('Step summaries routing status: default').textContent).toBe(
      'default',
    );

    openRolesTab();
    expect(screen.getByLabelText('Planner routing status: default').textContent).toBe('default');
  });

  it('marks a task override as custom and resets it to default', async () => {
    const { rerender } = render(<DefaultsPanel workspaceId={'ws-1' as never} />);

    expect(screen.getByLabelText('Step summaries routing status: default')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Step summaries routing model' }));

    expect(state.setWorkspaceOverrides).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        taskModels: {
          summarizer: { providerId: 'anthropic', model: 'claude-sonnet-4-6' },
        },
      }),
    );

    rerender(<DefaultsPanel workspaceId={'ws-1' as never} />);
    expect(screen.getByLabelText('Step summaries routing status: custom').textContent).toBe(
      'custom',
    );
    const reset = screen.getByRole('button', { name: 'Reset to default' });
    await waitFor(() => expect(reset.hasAttribute('disabled')).toBe(false));
    fireEvent.click(reset);

    expect(state.setWorkspaceOverrides).toHaveBeenLastCalledWith(
      'ws-1',
      expect.objectContaining({ taskModels: null }),
    );

    rerender(<DefaultsPanel workspaceId={'ws-1' as never} />);
    expect(screen.getByLabelText('Step summaries routing status: default')).toBeDefined();
  });

  it('persists an effort for a task model', () => {
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);

    fireEvent.click(screen.getByRole('button', { name: 'Workflow orchestrator routing model' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Workflow orchestrator routing high effort' }),
    );

    expect(state.setWorkspaceOverrides).toHaveBeenLastCalledWith(
      'ws-1',
      expect.objectContaining({
        taskModels: {
          workflow_orchestrator: {
            providerId: 'anthropic',
            model: 'claude-sonnet-4-6',
            effort: 'high',
          },
        },
      }),
    );
  });

  it('drops the effort when the task model has no effort ladder', () => {
    state.workspaceOverrides = {
      'ws-1': {
        ...EMPTY_OVERRIDES,
        taskModels: {
          summarizer: { providerId: 'anthropic', model: 'sonnet-4.6', effort: 'high' },
        },
      },
    };
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);

    fireEvent.click(screen.getByRole('button', { name: 'Step summaries routing cheap model' }));

    expect(state.setWorkspaceOverrides).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        taskModels: {
          summarizer: { providerId: 'anthropic', model: 'claude-haiku-4-5' },
        },
      }),
    );
  });

  it('renders a row per agent role', () => {
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);
    openRolesTab();

    expect(screen.getByText('Scout')).toBeDefined();
    expect(screen.getByText('Debugger')).toBeDefined();
    expect(screen.getByText('Planner')).toBeDefined();
    expect(screen.getByText('Reviewer')).toBeDefined();
    expect(screen.getByText('Resolver')).toBeDefined();
    expect(screen.getByText('Custom')).toBeDefined();
  });

  it('reads the resolver role with no override as its compiled default', () => {
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);
    openRolesTab();

    expect(screen.getByRole('button', { name: 'Resolver routing model' }).textContent).toBe(
      'sonnet-5',
    );
    expect(screen.getByLabelText('Resolver routing status: default').textContent).toBe('default');
  });

  it('persists a resolver role model of its own', () => {
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);
    openRolesTab();

    fireEvent.click(screen.getByRole('button', { name: 'Resolver routing model' }));

    expect(state.setWorkspaceOverrides).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        roleModels: {
          resolver: { providerId: 'anthropic', model: 'sonnet-4.6', effort: 'medium' },
        },
      }),
    );
  });

  it('reads a role with no override as its compiled default', () => {
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);
    openRolesTab();

    expect(screen.getByRole('button', { name: 'Planner routing model' }).textContent).toBe(
      'opus-5',
    );
  });

  it('persists a role model with an effort the model supports', () => {
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);
    openRolesTab();

    fireEvent.click(screen.getByRole('button', { name: 'Scout routing model' }));

    expect(state.setWorkspaceOverrides).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        roleModels: {
          scout: { providerId: 'anthropic', model: 'sonnet-4.6', effort: 'low' },
        },
      }),
    );
  });

  it('pins a role to a cheap model with no effort ladder instead of clearing it', () => {
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);
    openRolesTab();

    fireEvent.click(screen.getByRole('button', { name: 'Debugger routing cheap model' }));

    expect(state.setWorkspaceOverrides).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        roleModels: {
          investigator: { providerId: 'anthropic', model: 'haiku-4.5', effort: 'medium' },
        },
      }),
    );
  });

  it('drops an effort the newly picked model cannot reach', () => {
    state.workspaceOverrides = {
      'ws-1': {
        ...EMPTY_OVERRIDES,
        roleModels: {
          reviewer: { providerId: 'anthropic', model: 'claude-opus-5', effort: 'max' },
        },
      },
    };
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);
    openRolesTab();

    fireEvent.click(screen.getByRole('button', { name: 'Reviewer routing model' }));

    expect(state.setWorkspaceOverrides).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        roleModels: {
          reviewer: { providerId: 'anthropic', model: 'sonnet-4.6', effort: 'high' },
        },
      }),
    );
  });

  it('offers no fallback control while the role runs on its compiled default', () => {
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);
    openRolesTab();

    expect(screen.queryByRole('button', { name: 'Planner fallback: automatic' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Planner fallback routing/ })).toBeNull();
  });

  it('reads an unset fallback as automatic once the role is pinned', () => {
    state.workspaceOverrides = {
      'ws-1': {
        ...EMPTY_OVERRIDES,
        roleModels: {
          planner: { providerId: 'anthropic', model: 'claude-opus-5', effort: 'high' },
        },
      },
    };
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);
    openRolesTab();

    expect(screen.getByRole('button', { name: 'Planner fallback: automatic' }).textContent).toBe(
      'Automatic',
    );
  });

  it('persists a fallback without an effort of its own', () => {
    state.workspaceOverrides = {
      'ws-1': {
        ...EMPTY_OVERRIDES,
        roleModels: {
          planner: { providerId: 'anthropic', model: 'claude-opus-5', effort: 'high' },
        },
      },
    };
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);
    openRolesTab();

    fireEvent.click(screen.getByRole('button', { name: 'Planner fallback: automatic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Planner fallback routing cheap model' }));

    expect(state.setWorkspaceOverrides).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        roleModels: {
          planner: {
            providerId: 'anthropic',
            model: 'opus-5',
            effort: 'high',
            fallback: { providerId: 'anthropic', model: 'haiku-4.5' },
          },
        },
      }),
    );
  });

  it('shows the primary effort on the fallback and refuses to edit it', () => {
    state.workspaceOverrides = {
      'ws-1': {
        ...EMPTY_OVERRIDES,
        roleModels: {
          planner: {
            providerId: 'anthropic',
            model: 'claude-opus-5',
            effort: 'low',
            fallback: { providerId: 'anthropic', model: 'haiku-4.5' },
          },
        },
      },
    };
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);
    openRolesTab();

    const effort = screen.getByRole('button', { name: 'Planner fallback routing high effort' });
    expect(effort.textContent).toBe('low');
    expect(effort.hasAttribute('disabled')).toBe(true);
  });

  it('keeps the fallback when the role changes its primary model', () => {
    state.workspaceOverrides = {
      'ws-1': {
        ...EMPTY_OVERRIDES,
        roleModels: {
          planner: {
            providerId: 'anthropic',
            model: 'claude-opus-5',
            effort: 'high',
            fallback: { providerId: 'anthropic', model: 'haiku-4.5' },
          },
        },
      },
    };
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);
    openRolesTab();

    fireEvent.click(screen.getByRole('button', { name: 'Planner routing cheap model' }));

    expect(state.setWorkspaceOverrides).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        roleModels: {
          planner: {
            providerId: 'anthropic',
            model: 'haiku-4.5',
            effort: 'high',
            fallback: { providerId: 'anthropic', model: 'haiku-4.5' },
          },
        },
      }),
    );
  });

  it('deletes the fallback key on reset and keeps the pin', () => {
    state.workspaceOverrides = {
      'ws-1': {
        ...EMPTY_OVERRIDES,
        roleModels: {
          planner: {
            providerId: 'anthropic',
            model: 'claude-opus-5',
            effort: 'high',
            fallback: { providerId: 'anthropic', model: 'haiku-4.5' },
          },
        },
      },
    };
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);
    openRolesTab();

    fireEvent.click(screen.getByRole('button', { name: 'Planner fallback routing reset' }));

    expect(state.setWorkspaceOverrides).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        roleModels: {
          planner: { providerId: 'anthropic', model: 'opus-5', effort: 'high' },
        },
      }),
    );
  });

  it('drops a fallback the registry cannot resolve instead of storing it back', () => {
    state.workspaceOverrides = {
      'ws-1': {
        ...EMPTY_OVERRIDES,
        roleModels: {
          planner: {
            providerId: 'anthropic',
            model: 'claude-opus-5',
            effort: 'high',
            fallback: { providerId: 'anthropic', model: 'claude-opus-99' },
          },
        },
      },
    };
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);
    openRolesTab();

    expect(screen.getByRole('button', { name: 'Planner fallback: automatic' })).toBeDefined();
  });

  it('resets a stored role override to the selected default provider', async () => {
    state.workspaceOverrides = {
      'ws-1': {
        ...EMPTY_OVERRIDES,
        defaultProviderId: 'cursor',
        roleModels: {
          reviewer: { providerId: 'anthropic', model: 'claude-opus-5', effort: 'max' },
        },
      },
    };
    const { rerender } = render(<DefaultsPanel workspaceId={'ws-1' as never} />);
    openRolesTab();

    expect(screen.getByRole('button', { name: 'Reviewer routing model' }).textContent).toBe(
      'opus-5',
    );
    expect(screen.getByLabelText('Reviewer routing status: custom')).toBeDefined();
    const reset = screen.getByRole('button', { name: 'Reset to default' });
    await waitFor(() => expect(reset.hasAttribute('disabled')).toBe(false));
    fireEvent.click(reset);

    expect(state.setWorkspaceOverrides).toHaveBeenLastCalledWith(
      'ws-1',
      expect.objectContaining({ roleModels: null }),
    );

    rerender(<DefaultsPanel workspaceId={'ws-1' as never} />);
    expect(screen.getByLabelText('Reviewer routing status: default')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reviewer routing provider' }).textContent).toBe(
      'cursor',
    );
  });

  it('keeps provider changes local while automatic is selected', () => {
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);

    fireEvent.click(screen.getByRole('button', { name: 'Step summaries routing provider' }));

    expect(state.setWorkspaceOverrides).not.toHaveBeenCalled();
    const modelPicker = screen.getByRole('button', { name: 'Step summaries routing model' });

    fireEvent.click(modelPicker);

    expect(state.setWorkspaceOverrides).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        taskModels: {
          summarizer: { providerId: 'cursor', model: 'claude-sonnet-4-6' },
        },
      }),
    );
  });

  it('keeps the default provider and routing pool rows visible while switching groups', () => {
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);

    expect(screen.getByText('Default provider')).toBeDefined();
    expect(screen.getByText('Routing pool')).toBeDefined();
    expect(screen.getByText('Step summaries')).toBeDefined();
    expect(screen.queryByText('Scout')).toBeNull();

    openRolesTab();

    expect(screen.getByText('Default provider')).toBeDefined();
    expect(screen.getByText('Routing pool')).toBeDefined();
    expect(screen.getByText('Scout')).toBeDefined();
    expect(screen.queryByText('Summaries')).toBeNull();
  });

  it('bounds the default provider picker and routing pool without squeezing the label', () => {
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);

    expect(screen.getByRole('button', { name: 'Default provider' }).parentElement?.className).toBe(
      'w-64',
    );
    expect(screen.getByRole('button', { name: 'anthropic' }).parentElement?.className).toContain(
      'max-w-64',
    );
  });

  it('shows the override count for each group in its tab label', () => {
    state.workspaceOverrides = {
      'ws-1': {
        ...EMPTY_OVERRIDES,
        taskModels: {
          summarizer: { providerId: 'anthropic', model: 'claude-sonnet-4-6' },
        },
        roleModels: {
          scout: { providerId: 'anthropic', model: 'claude-sonnet-4-6', effort: 'low' },
          reviewer: { providerId: 'anthropic', model: 'claude-opus-5', effort: 'max' },
        },
      },
    };
    render(<DefaultsPanel workspaceId={'ws-1' as never} />);

    expect(screen.getByRole('tab', { name: 'Task models (1)' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Agent roles (2)' })).toBeDefined();
  });
});
