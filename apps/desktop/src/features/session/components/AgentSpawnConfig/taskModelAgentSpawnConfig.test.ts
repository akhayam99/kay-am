import { describe, expect, it } from 'vitest';
import { taskModelAgentSpawnConfig } from './taskModelAgentSpawnConfig';

describe('taskModelAgentSpawnConfig', () => {
  it('passes the configured task effort into the spawn config', () => {
    const config = taskModelAgentSpawnConfig({
      task: 'pr_draft',
      preferences: {
        pr_draft: {
          providerId: 'codex',
          model: 'gpt-5.6-luna',
          effort: 'xhigh',
        },
      },
      workspaceDefaultProviderId: 'codex',
      sessionDefaultProviderId: 'anthropic',
    });

    expect(config).toMatchObject({
      provider: 'codex',
      model: 'gpt-5.6-luna',
      effort: 'xhigh',
    });
  });
});
