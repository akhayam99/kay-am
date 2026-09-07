import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  parseStreamJsonLine,
  parseCursorStreamLine,
  parseCodexJsonLine,
  parseGeminiJsonLine,
  parseOpenCodeJsonLine,
  type ParseContext,
} from '@goodboy/core';
import type { IsoDateTime, ProviderId, ProviderRunId, TurnEvent } from '@goodboy/types';
import { classifyProviderError } from './classifyProviderError';

function parseForProvider(
  provider: ProviderId,
  line: string,
  ctx: ParseContext,
): ReadonlyArray<TurnEvent> {
  switch (provider) {
    case 'anthropic':
      return parseStreamJsonLine(line, ctx);
    case 'cursor':
      return parseCursorStreamLine(line, ctx);
    case 'codex':
      return parseCodexJsonLine(line, ctx);
    case 'gemini':
      return parseGeminiJsonLine(line, ctx);
    case 'opencode':
    case 'openrouter':
    case 'moonshot':
      return parseOpenCodeJsonLine({ line, ctx });
    default: {
      const _exhaustive: never = provider;
      void _exhaustive;
      return parseStreamJsonLine(line, ctx);
    }
  }
}

const AUTH_REQUIRED_PREFIX = '__auth_required__:';

export type AuthRequiredPayload = {
  readonly providerId: ProviderId;
  readonly identity: string | null;
};

export const encodeAuthRequiredMessage = (payload: AuthRequiredPayload): string => {
  return `${AUTH_REQUIRED_PREFIX}${JSON.stringify(payload)}`;
};

export const decodeAuthRequiredMessage = (message: string): AuthRequiredPayload | null => {
  if (!message.startsWith(AUTH_REQUIRED_PREFIX)) {
    return null;
  }
  try {
    return JSON.parse(message.slice(AUTH_REQUIRED_PREFIX.length)) as AuthRequiredPayload;
  } catch {
    return null;
  }
};

const EVENT_NAME = 'turn_event';
const NO_RESPONSE_MESSAGE =
  'provider exited without a response. check that the CLI is configured correctly.';

type Params = {
  readonly line: string;
};

const isJsonProviderFrame = ({ line }: Params): boolean => {
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === 'object' && value !== null;
  } catch {
    return false;
  }
};

type ClaudePermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'dontAsk' | 'plan';

type SpawnArgs = {
  readonly runId: ProviderRunId;
  readonly provider: ProviderId;
  readonly model: string;
  readonly workingDir: string;
  readonly writableRoots: ReadonlyArray<string>;
  readonly prompt: string;
  readonly binary?: string;
  readonly allowedTools?: ReadonlyArray<string>;
  readonly disallowedTools?: ReadonlyArray<string>;
  readonly permissionMode?: ClaudePermissionMode;
  readonly resumeSessionId?: string;
  readonly systemPrompt?: string;
  readonly effort?: string;
  readonly workspaceId?: string;
  readonly sessionId?: string;
  readonly apiKeyEnv?: string;
  readonly credentialId?: string;
  readonly cursorMaxMode?: boolean;
  readonly writerLease?: {
    readonly path: string;
    readonly holder: string;
    readonly token: string;
  };
};

type RawTurnEnvelope =
  | { runId: string; type: 'line'; line: string }
  | { runId: string; type: 'end'; exit_code: number | null; stderr: string }
  | { runId: string; type: 'error'; message: string };

export async function* runTurn(
  args: SpawnArgs,
  now: () => IsoDateTime = () => new Date().toISOString() as IsoDateTime,
): AsyncIterable<TurnEvent> {
  const ctx = { runId: args.runId, now };
  const queue: TurnEvent[] = [];
  let resolver: ((value: IteratorResult<TurnEvent>) => void) | null = null;
  let rejector: ((err: unknown) => void) | null = null;
  let ended = false;
  let error: unknown = null;

  const flush = () => {
    if (!resolver) {
      return;
    }
    if (queue.length > 0) {
      const value = queue.shift()!;
      const r = resolver;
      resolver = null;
      r({ value, done: false });
      return;
    }
    if (ended) {
      const r = resolver;
      resolver = null;
      if (error) {
        const rej = rejector;
        rejector = null;
        rej?.(error);
      } else {
        r({ value: undefined, done: true });
      }
    }
  };

  let receivedAnyEvent = false;
  let receivedResponseEvent = false;
  const unparsedOutput: string[] = [];

  const unlisten: UnlistenFn = await listen<RawTurnEnvelope>(EVENT_NAME, (event) => {
    if (event.payload.runId !== args.runId) {
      return;
    }

    switch (event.payload.type) {
      case 'line': {
        const parsedEvents = parseForProvider(args.provider, event.payload.line, ctx);
        if (parsedEvents.length > 0) {
          receivedAnyEvent = true;
        }
        if (parsedEvents.length === 0 && event.payload.line.trim() !== '') {
          unparsedOutput.push(event.payload.line.trim());
        }
        for (const ev of parsedEvents) {
          if (
            ev.kind === 'error' &&
            classifyProviderError({ message: ev.message }).kind === 'usage_limit'
          ) {
            receivedResponseEvent = true;
            error = new Error(ev.message);
            ended = true;
            break;
          }
          if (ev.kind === 'assistant_text' || ev.kind === 'done' || ev.kind === 'error') {
            receivedResponseEvent = true;
          }
          queue.push(ev);
        }
        flush();
        break;
      }
      case 'end': {
        if (!receivedAnyEvent) {
          const stderrMessage = event.payload.stderr.trim();
          const stdoutMessage = unparsedOutput
            .filter((line) => !isJsonProviderFrame({ line }))
            .join('\n');
          const hasFailedExit = event.payload.exit_code !== null && event.payload.exit_code !== 0;
          const stdoutClassification = classifyProviderError({ message: stdoutMessage });
          const providerMessage = [
            hasFailedExit || stdoutClassification.kind !== 'other' ? stdoutMessage : '',
            stderrMessage,
          ]
            .filter((value) => value !== '')
            .join('\n');
          error =
            providerMessage !== '' ? new Error(providerMessage) : new Error(NO_RESPONSE_MESSAGE);
        }
        if (
          receivedAnyEvent &&
          !receivedResponseEvent &&
          event.payload.exit_code !== null &&
          event.payload.exit_code !== 0
        ) {
          const stderrMessage = event.payload.stderr.trim();
          const stdoutMessage = unparsedOutput
            .filter((line) => !isJsonProviderFrame({ line }))
            .join('\n');
          const providerMessage = [stdoutMessage, stderrMessage]
            .filter((value) => value !== '')
            .join('\n');
          error =
            providerMessage !== '' ? new Error(providerMessage) : new Error(NO_RESPONSE_MESSAGE);
        }
        ended = true;
        flush();
        break;
      }
      case 'error':
        error = new Error(event.payload.message);
        ended = true;
        flush();
        break;
    }
  });

  await invoke<string>('turn_spawn', { args });

  try {
    while (true) {
      if (queue.length > 0) {
        yield queue.shift()!;
        continue;
      }
      if (ended) {
        if (error) {
          throw error;
        }
        return;
      }
      const value = await new Promise<IteratorResult<TurnEvent>>((resolve, reject) => {
        resolver = resolve;
        rejector = reject;
      });
      if (value.done) {
        return;
      }
      yield value.value;
    }
  } finally {
    unlisten();
    if (!ended) {
      try {
        await invoke('turn_cancel', { runId: args.runId });
      } catch {
        // best-effort cancellation
      }
    }
  }
}

export const cancelTurn = async (runId: ProviderRunId): Promise<void> => {
  await invoke('turn_cancel', { runId });
};

export const listLiveRunIds = async (): Promise<ReadonlySet<string>> => {
  try {
    const ids = await invoke<string[]>('turn_list_live');
    return new Set(ids ?? []);
  } catch {
    return new Set();
  }
};

export const writeAttachment = async (args: {
  readonly worktreeDir: string;
  readonly attachmentId: string;
  readonly fileName: string;
  readonly dataBase64: string;
}): Promise<string> => {
  return invoke<string>('attachment_write', args);
};

export const readAttachment = async (worktreeDir: string, relPath: string): Promise<string> => {
  return invoke<string>('attachment_read', { worktreeDir, relPath });
};

export const deleteAttachment = async (worktreeDir: string, relPath: string): Promise<void> => {
  await invoke('attachment_delete', { worktreeDir, relPath });
};
