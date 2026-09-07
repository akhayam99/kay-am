import { openToolSettings } from '../../../integrations/openToolSettings';
import { useEffect, useMemo, useState } from 'react';
import { IconButton, StudioRailLayout } from '@goodboy/ui';
import { RefreshCw } from 'lucide-react';
import type { SessionId, WorkspaceId } from '@goodboy/types';
import { CONCEPT_ICONS, CONCEPT_TONE } from '../../../../shared/components/conceptIcons';
import { StudioShell } from '../../../../shared/components/StudioShell';
import { stripInlineMarkdown } from '../../../../shared/components/InlineMarkdown/stripInlineMarkdown';
import { useSessionById } from '../../../../store';
import { recordSessionId } from '../../recordSessionId';
import { useInboxRecords } from '../../useInboxRecords';
import { INBOX_PROVIDERS, type InboxKind, type InboxProvider, type InboxRecord } from '../../types';
import { filterInboxRecords, type InboxKindFilter } from '../../kindFilter';
import {
  readInboxKindFilter,
  readInboxProviders,
  writeInboxKindFilter,
  writeInboxProviders,
} from '../../kindFilterStorage';
import { InboxDetail } from './InboxDetail';
import { InboxRail } from './InboxRail';

type Props = {
  readonly workspaceId: WorkspaceId;
  readonly rootPath: string;
  readonly workspaceName: string;
  readonly initialProvider?: InboxProvider | null;
  readonly initialKind?: InboxKind | null;
  readonly initialRecordKey?: string | null;
  readonly initialSessionId?: SessionId | null;
  readonly onClose: () => void;
};

type KindToFilterParams = {
  readonly kind: InboxKind;
};

const kindToFilter = ({ kind }: KindToFilterParams): InboxKindFilter => {
  switch (kind) {
    case 'issue':
      return 'issue';
    case 'pr':
    case 'mr':
      return 'pr-mr';
    case 'thread':
      return 'thread';
    case 'error':
      return 'error';
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
};

export const InboxStudio = ({
  workspaceId,
  rootPath,
  workspaceName,
  initialProvider = null,
  initialKind = null,
  initialRecordKey = null,
  initialSessionId = null,
  onClose,
}: Props) => {
  const { records, isLoading, errors, refetch } = useInboxRecords({ workspaceId, rootPath });
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<InboxKindFilter>(() => {
    if (initialKind != null) {
      return kindToFilter({ kind: initialKind });
    }
    return readInboxKindFilter({ workspaceId }) ?? 'all';
  });
  const [selectedProviders, setSelectedProviders] = useState<ReadonlySet<InboxProvider>>(() => {
    if (initialProvider != null) {
      return new Set([initialProvider]);
    }
    return new Set(readInboxProviders({ workspaceId }));
  });
  const [selectedKey, setSelectedKey] = useState<string | null>(initialRecordKey);
  const [sessionFilter, setSessionFilter] = useState<SessionId | null>(initialSessionId);
  const filteredSession = useSessionById(sessionFilter);

  useEffect(() => {
    writeInboxKindFilter({ workspaceId, kindFilter });
  }, [workspaceId, kindFilter]);

  useEffect(() => {
    writeInboxProviders({ workspaceId, providers: selectedProviders });
  }, [workspaceId, selectedProviders]);

  const scopedRecords = useMemo(
    () =>
      sessionFilter == null
        ? records
        : records.filter((record) => recordSessionId({ record }) === sessionFilter),
    [records, sessionFilter],
  );

  const sessionFilterLabel = ((): string | null => {
    if (sessionFilter == null) {
      return null;
    }
    const goal =
      filteredSession == null ? '' : stripInlineMarkdown({ text: filteredSession.goal }).trim();
    return goal === '' ? 'Linked session' : goal;
  })();

  const filteredRecords = useMemo(
    () =>
      filterInboxRecords({
        records: scopedRecords,
        query,
        kindFilter,
        providers: selectedProviders,
      }),
    [scopedRecords, query, kindFilter, selectedProviders],
  );

  const selectedRecord = useMemo(
    () => scopedRecords.find((record) => record.key === selectedKey) ?? null,
    [scopedRecords, selectedKey],
  );

  const [launchFocusRequest, setLaunchFocusRequest] = useState(0);

  const onSelect = (record: InboxRecord): void => {
    setSelectedKey(record.key);
  };

  const onDeselect = (): void => {
    setSelectedKey(null);
  };

  const onActivate = (record: InboxRecord): void => {
    setSelectedKey(record.key);
    setLaunchFocusRequest((current) => current + 1);
  };

  const onToggleProvider = (provider: InboxProvider): void => {
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) {
        next.delete(provider);
        return next;
      }
      next.add(provider);
      return next;
    });
  };

  const onClearFilters = (): void => {
    setQuery('');
    setKindFilter('all');
    setSelectedProviders(new Set());
    setSessionFilter(null);
  };

  const onClearSessionFilter = (): void => {
    setSessionFilter(null);
  };

  const hasFiltersActive =
    query.trim() !== '' ||
    kindFilter !== 'all' ||
    selectedProviders.size > 0 ||
    sessionFilter != null;

  const onOpenIntegrations = () => openToolSettings({});

  return (
    <StudioShell
      icon={CONCEPT_ICONS.inbox}
      tone={CONCEPT_TONE.inbox}
      title="Inbox"
      workspaceName={workspaceName}
      closeLabel="close inbox studio"
      headerAccessory={
        <IconButton
          icon={RefreshCw}
          label="Refresh inbox"
          onClick={refetch}
          disabled={isLoading}
          busy={isLoading}
        />
      }
      onClose={onClose}
    >
      {(requestClose) => (
        <StudioRailLayout
          railLabel="Inbox"
          railWidth="xwide"
          rail={
            <InboxRail
              records={filteredRecords}
              allRecords={scopedRecords}
              selectedProviders={selectedProviders}
              onToggleProvider={onToggleProvider}
              sessionFilterLabel={sessionFilterLabel}
              onClearSessionFilter={onClearSessionFilter}
              query={query}
              onQueryChange={setQuery}
              kindFilter={kindFilter}
              onKindFilterChange={setKindFilter}
              selectedKey={selectedKey}
              onSelect={onSelect}
              onActivate={onActivate}
              onClearFilters={onClearFilters}
              isLoading={isLoading}
              errors={INBOX_PROVIDERS.flatMap((provider) => {
                const message = errors[provider];
                return message == null ? [] : [{ provider, message }];
              })}
              onRefresh={refetch}
            />
          }
          detail={
            <InboxDetail
              record={selectedRecord}
              records={scopedRecords}
              hasVisibleRecords={filteredRecords.length > 0}
              hasFiltersActive={hasFiltersActive}
              workspaceId={workspaceId}
              rootPath={rootPath}
              isLoading={isLoading}
              errors={errors}
              onRefresh={refetch}
              onClose={requestClose}
              onDeselect={onDeselect}
              onClearFilters={onClearFilters}
              onOpenIntegrations={onOpenIntegrations}
              launchFocusRequest={launchFocusRequest}
            />
          }
        />
      )}
    </StudioShell>
  );
};
