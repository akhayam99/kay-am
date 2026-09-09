import type { AgentId, IsoDateTime, PermissionRuleId, ProviderRunId, SessionId } from './ids';
import type { MessageAttachment } from './message';
import type { ClaudePermissionMode, PermissionScope } from './permission';
import type { ProviderName } from './provider';
import type { ProviderId } from './provider-registry';
import type { EffortLevel, ModelSelection } from './model-catalog';

export type ProviderCapabilities = {
  readonly streaming: boolean;
  readonly toolUse: boolean;
  readonly fileEdits: boolean;
  readonly defaultModel: string;
  readonly availableModels: ReadonlyArray<string>;
};

export type ProviderUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly cacheCreationInputTokens?: number;
  readonly contextTokens?: number;
  readonly estimatedCostUsd: number;
};

export type DetectResult =
  | { kind: 'available'; binary: string; version: string }
  | { kind: 'missing'; binary: string; reason: string };

export type PermissionMode = Exclude<ClaudePermissionMode, 'dontAsk'>;

export type TurnPermissionFlags = {
  readonly mode: PermissionMode;
  readonly allowedTools?: ReadonlyArray<string>;
  readonly disallowedTools?: ReadonlyArray<string>;
};

export type TurnRequest = {
  readonly runId: ProviderRunId;
  readonly sessionId: SessionId;
  readonly model: string;
  readonly selection?: ModelSelection;
  readonly effort?: EffortLevel;
  readonly workingDir: string;
  readonly systemPrompt: string;
  readonly userMessage: string;
  readonly permissionFlags?: TurnPermissionFlags;
};

export type TurnEvent =
  | {
      kind: 'user_text';
      runId: ProviderRunId;
      text: string;
      attachments?: ReadonlyArray<MessageAttachment>;
      provider?: ProviderId;
      model?: string;
      at: IsoDateTime;
    }
  | { kind: 'assistant_text'; runId: ProviderRunId; delta: string; at: IsoDateTime }
  | {
      kind: 'tool_call_start';
      runId: ProviderRunId;
      toolUseId: string;
      toolName: string;
      input: unknown;
      at: IsoDateTime;
    }
  | {
      kind: 'tool_call_end';
      runId: ProviderRunId;
      toolUseId: string;
      output: unknown;
      isError: boolean;
      at: IsoDateTime;
    }
  | {
      kind: 'file_edit';
      runId: ProviderRunId;
      path: string;
      editType: 'create' | 'modify' | 'delete';
      at: IsoDateTime;
    }
  | { kind: 'usage'; runId: ProviderRunId; usage: ProviderUsage; at: IsoDateTime }
  | {
      kind: 'error';
      runId: ProviderRunId;
      message: string;
      retryable?: boolean;
      at: IsoDateTime;
    }
  | {
      kind: 'decision_note';
      runId: ProviderRunId;
      message: string;
      at: IsoDateTime;
    }
  | { kind: 'done'; runId: ProviderRunId; at: IsoDateTime }
  | {
      kind: 'provider_session_init';
      runId: ProviderRunId;
      providerSessionId: string;
      provider?: ProviderId;
      at: IsoDateTime;
    }
  | {
      kind: 'skill_invocation';
      runId: ProviderRunId;
      skillName: string;
      args: ReadonlyArray<string>;
      at: IsoDateTime;
    }
  | {
      kind: 'step_transition';
      runId: ProviderRunId;
      fromStep: { ordinal: number; name: string };
      toStep: { ordinal: number; name: string };
      carryForwardContext: string;
      sessionId?: SessionId;
      fromAgentId?: AgentId;
      degraded?: true;
      durationMs?: number;
      at: IsoDateTime;
    }
  | {
      kind: 'orchestrator_decision';
      runId: ProviderRunId;
      action: 'next' | 'done' | 'blocked';
      reason: string;
      stepName?: string;
      operatorNote?: string;
      at: IsoDateTime;
    }
  | {
      kind: 'permission_request';
      runId: ProviderRunId;
      toolUseId: string;
      toolName: string;
      input: unknown;
      at: IsoDateTime;
    }
  | {
      kind: 'permission_decision';
      runId: ProviderRunId;
      toolUseId: string;
      decision: 'allow' | 'deny';
      scope?: PermissionScope;
      ruleId: PermissionRuleId | null;
      decidedBy: 'engine' | 'user' | 'default';
      at: IsoDateTime;
    }
  | {
      kind: 'unknown_payload';
      runId: ProviderRunId;
      adapter: string;
      payloadType: string;
      raw: unknown;
      at: IsoDateTime;
    };

export type ProviderAdapter = {
  readonly id: ProviderName;
  readonly capabilities: ProviderCapabilities;
  detect(): Promise<DetectResult>;
  spawn(request: TurnRequest): AsyncIterable<TurnEvent>;
  cost(usage: ProviderUsage, model: string): number;
};
