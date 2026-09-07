import { IconButton } from '@goodboy/ui';
import { X } from 'lucide-react';
import type { WorkspaceId } from '@goodboy/types';
import { GithubIssueDetail } from '../../../github/GithubIssueDetail';
import { GitlabIssueDetail } from '../../../integrations/gitlab/GitlabIssueDetail';
import { MrDetailPanel } from '../../../integrations/gitlab/GitlabStudio/MrDetailPanel';
import { LinearIssueDetail } from '../../../integrations/linear/LinearIssueDetail';
import { JiraIssueDetail } from '../../../integrations/jira/JiraIssueDetail';
import { SentryIssueDetail } from '../../../integrations/sentry/SentryIssueDetail';
import { useSentryIssueDetail } from '../../../integrations/sentry/useSentryIssueDetail';
import { SlackThreadDetail } from '../../../integrations/slack/SlackThreadDetail';
import { PrDetailPanel } from '../../../integrations/bitbucket/BitbucketStudio/PrDetailPanel';
import type { InboxProvider, InboxRecord } from '../../types';
import { RecordLaunchDock } from '../RecordLaunchDock';
import { InboxEmptySummary } from './InboxEmptySummary';

type Props = {
  readonly record: InboxRecord | null;
  readonly records: ReadonlyArray<InboxRecord>;
  readonly hasVisibleRecords: boolean;
  readonly hasFiltersActive: boolean;
  readonly workspaceId: WorkspaceId;
  readonly rootPath: string;
  readonly isLoading: boolean;
  readonly errors: Readonly<Record<InboxProvider, string | null>>;
  readonly onRefresh: () => void;
  readonly onClose: () => void;
  readonly onDeselect: () => void;
  readonly onClearFilters: () => void;
  readonly onOpenIntegrations: () => void;
  readonly launchFocusRequest: number;
};

export const InboxDetail = ({
  record,
  records,
  hasVisibleRecords,
  hasFiltersActive,
  workspaceId,
  rootPath,
  isLoading,
  errors,
  onRefresh,
  onClose,
  onDeselect,
  onClearFilters,
  onOpenIntegrations,
  launchFocusRequest,
}: Props) => {
  const sentryIssueId = record?.payload.provider === 'sentry' ? record.payload.issue.id : null;
  const sentryDetail = useSentryIssueDetail({ workspaceId, issueId: sentryIssueId });

  if (record == null) {
    return (
      <InboxEmptySummary
        records={records}
        hasVisibleRecords={hasVisibleRecords}
        hasFiltersActive={hasFiltersActive}
        onClearFilters={onClearFilters}
        onOpenIntegrations={onOpenIntegrations}
      />
    );
  }

  const payload = record.payload;
  const deselectAction = (
    <IconButton
      icon={X}
      label="Close the item"
      tooltip="Back to the inbox summary"
      onClick={onDeselect}
    />
  );

  switch (payload.provider) {
    case 'github':
      return (
        <GithubIssueDetail
          issue={payload.issue}
          editContext={{ workspaceId, rootPath }}
          headerActions={deselectAction}
          dock={
            <RecordLaunchDock
              record={record}
              workspaceId={workspaceId}
              onClose={onClose}
              focusRequest={launchFocusRequest}
            />
          }
        />
      );
    case 'gitlab':
      switch (payload.kind) {
        case 'issue':
          return (
            <GitlabIssueDetail
              issue={payload.issue}
              workspaceId={workspaceId}
              headerActions={deselectAction}
              dock={
                <RecordLaunchDock
                  record={record}
                  workspaceId={workspaceId}
                  onClose={onClose}
                  focusRequest={launchFocusRequest}
                />
              }
            />
          );
        case 'mr':
          return (
            <MrDetailPanel
              mr={payload.mr}
              workspaceId={workspaceId}
              host={payload.host}
              onRefresh={onRefresh}
              onClose={onClose}
              headerActions={deselectAction}
              dock={
                <RecordLaunchDock
                  record={record}
                  workspaceId={workspaceId}
                  onClose={onClose}
                  focusRequest={launchFocusRequest}
                />
              }
            />
          );
        default: {
          const exhaustive: never = payload;
          return exhaustive;
        }
      }
    case 'linear':
      return (
        <LinearIssueDetail
          issue={payload.issue}
          workspaceId={workspaceId}
          headerActions={deselectAction}
          dock={
            <RecordLaunchDock
              record={record}
              workspaceId={workspaceId}
              onClose={onClose}
              focusRequest={launchFocusRequest}
            />
          }
        />
      );
    case 'jira':
      return (
        <JiraIssueDetail
          issue={payload.issue}
          workspaceId={workspaceId}
          onIssueWritten={onRefresh}
          headerActions={deselectAction}
          dock={
            <RecordLaunchDock
              record={record}
              workspaceId={workspaceId}
              onClose={onClose}
              focusRequest={launchFocusRequest}
            />
          }
        />
      );
    case 'sentry':
      return (
        <SentryIssueDetail
          identifier={payload.issue.shortId ?? payload.issue.id}
          title={payload.issue.title}
          culprit={payload.issue.culprit}
          level={payload.issue.level}
          status={payload.issue.status}
          permalink={payload.issue.permalink}
          count={payload.issue.count}
          userCount={payload.issue.userCount}
          firstSeen={payload.issue.firstSeen}
          lastSeen={payload.issue.lastSeen}
          detail={sentryDetail.detail?.issueId === payload.issue.id ? sentryDetail.detail : null}
          isLoading={sentryDetail.isLoading}
          error={sentryDetail.error}
          summaryIsLoading={false}
          summaryError={null}
          onRetrySummary={() => undefined}
          headerActions={deselectAction}
          dock={
            <RecordLaunchDock
              record={record}
              workspaceId={workspaceId}
              onClose={onClose}
              focusRequest={launchFocusRequest}
            />
          }
        />
      );
    case 'slack':
      return (
        <SlackThreadDetail
          workspaceId={workspaceId}
          channelId={payload.channel.id}
          threadTs={payload.head.threadTs ?? payload.head.ts}
          fallbackChannelName={payload.channel.name}
          fallbackMessage={payload.head}
          fallbackUrl={record.url}
          headerActions={deselectAction}
          dock={
            <RecordLaunchDock
              record={record}
              workspaceId={workspaceId}
              onClose={onClose}
              focusRequest={launchFocusRequest}
            />
          }
        />
      );
    case 'bitbucket':
      return (
        <PrDetailPanel
          pullRequest={payload.pullRequest}
          repo={payload.repo}
          sessionId={null}
          workspaceId={workspaceId}
          isLoading={isLoading}
          error={errors.bitbucket}
          onRefresh={onRefresh}
          onClose={onClose}
          headerActions={deselectAction}
          dock={
            <RecordLaunchDock
              record={record}
              workspaceId={workspaceId}
              onClose={onClose}
              focusRequest={launchFocusRequest}
            />
          }
        />
      );
    default: {
      const exhaustive: never = payload;
      return exhaustive;
    }
  }
};
