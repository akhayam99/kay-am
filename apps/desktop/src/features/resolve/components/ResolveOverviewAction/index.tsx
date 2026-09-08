import { useState } from 'react';
import { Button } from '@goodboy/ui';
import type { ResolveAttempt, SessionId } from '@goodboy/types';
import { useAppStore } from '../../../../store';
import { openReview } from '../../../review/openReview';
import { DEFAULT_AGENT_SPAWN_CONFIG } from '../../../session/components/AgentSpawnConfig/defaultAgentSpawnConfig';
import type { AgentSpawnConfigValue } from '../../../session/components/AgentSpawnConfig/AgentSpawnConfigValue';
import { hasActiveResolveRun } from '../../hasActiveResolveRun';
import { startResolveRun } from '../../startResolveRun';
import { ResolveSpawnSheet } from '../ResolveSpawnSheet';

type Props = {
  readonly sessionId: SessionId;
};

const EMPTY_ATTEMPTS: ReadonlyArray<ResolveAttempt> = [];

export const ResolveOverviewAction = ({ sessionId }: Props) => {
  const pr = useAppStore((s) => s.sessionGithub[sessionId]?.pr ?? null);
  const attempts = useAppStore((s) => s.sessionResolveAttempts[sessionId] ?? EMPTY_ATTEMPTS);
  const spawnAgent = useAppStore((s) => s.spawnAgent);
  const setAgentConfig = useAppStore((s) => s.setAgentConfig);
  const [spawnConfig, setSpawnConfig] = useState<AgentSpawnConfigValue>(DEFAULT_AGENT_SPAWN_CONFIG);
  const [isSpawning, setIsSpawning] = useState(false);

  if (pr === null) {
    return null;
  }

  if (hasActiveResolveRun({ attempts })) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => openReview({ sessionId, mode: 'queue' })}
      >
        For you
      </Button>
    );
  }

  const onStart = async (): Promise<void> => {
    setIsSpawning(true);
    try {
      await startResolveRun({ sessionId, pr, spawnConfig, spawnAgent, setAgentConfig });
      openReview({ sessionId, mode: 'queue' });
    } finally {
      setIsSpawning(false);
    }
  };

  return (
    <ResolveSpawnSheet
      value={spawnConfig}
      onChange={setSpawnConfig}
      disabled={false}
      isBusy={isSpawning}
      startLabel="Start a resolve run"
      onStart={() => void onStart()}
    />
  );
};
