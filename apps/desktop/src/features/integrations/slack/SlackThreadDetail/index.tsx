import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { WorkspaceId } from '@goodboy/types';
import { RecordDetailHeader, StudioDetailLayout } from '../../../../shared/components/StudioDetail';
import { resolveDetailFields, slackThreadFields } from '../../../../shared/detail-fields';
import { slackGetPermalink, type SlackMessage } from '../client';
import { buildThreadProperties } from '../buildThreadProperties';
import { slackUserNames } from '../nameMaps';
import { slackThreadTitle } from '../threadFormulas';
import { ThreadConversation } from '../ThreadConversation';
import { useSlackThread } from '../useSlackThread';
import { useSlackThreadActions } from '../useSlackThreadActions';

type Fit = 'fill' | 'bleed' | 'flow';

type Props = {
  readonly workspaceId: WorkspaceId;
  readonly channelId: string;
  readonly threadTs: string;
  readonly fallbackChannelName: string;
  readonly fallbackMessage: SlackMessage | null;
  readonly fallbackUrl?: string | null;
  readonly fit?: Fit;
  readonly headerActions?: ReactNode;
  readonly dock?: ReactNode;
};

export const SlackThreadDetail = ({
  workspaceId,
  channelId,
  threadTs,
  fallbackChannelName,
  fallbackMessage,
  fallbackUrl = null,
  fit = 'fill',
  headerActions,
  dock,
}: Props) => {
  const [permalink, setPermalink] = useState<string | null>(fallbackUrl);
  const isEnabled = channelId !== '' && threadTs !== '';
  const thread = useSlackThread({ workspaceId, channelId, threadTs, isEnabled });
  const actions = useSlackThreadActions({ workspaceId, channelId, threadTs, isEnabled });

  useEffect(() => {
    setPermalink(fallbackUrl);
    if (!isEnabled) {
      return;
    }
    let isCurrent = true;
    void slackGetPermalink({ workspaceId, channelId, messageTs: threadTs })
      .then((url) => {
        if (isCurrent) {
          setPermalink(url);
        }
      })
      .catch(() => undefined);
    return () => {
      isCurrent = false;
    };
  }, [workspaceId, channelId, threadTs, fallbackUrl, isEnabled]);

  const users = thread.users;
  const channelName = thread.channelName !== channelId ? thread.channelName : fallbackChannelName;
  const messages =
    thread.messages.length > 0 ? thread.messages : fallbackMessage == null ? [] : [fallbackMessage];
  const userNames = useMemo(() => slackUserNames({ users }), [users]);
  const properties = useMemo(
    () =>
      resolveDetailFields({
        registry: slackThreadFields,
        entity: buildThreadProperties({ channelName, messages, userNames }),
      }),
    [channelName, messages, userNames],
  );
  const rootText = messages[0]?.text ?? '';
  const title = slackThreadTitle({ text: rootText });

  return (
    <StudioDetailLayout
      fit={fit}
      dock={dock}
      header={
        <RecordDetailHeader
          provider="slack"
          identifier={`#${channelName}`}
          title={title !== '' ? title : `#${channelName}`}
          subtitle={
            <span className="font-mono text-2xs text-muted-foreground">#{channelName}</span>
          }
          actions={headerActions}
          externalRef={
            permalink != null && permalink !== '' ? { url: permalink, label: 'thread' } : null
          }
        />
      }
      properties={properties}
    >
      <ThreadConversation
        messages={messages}
        users={users}
        channels={thread.channels}
        isLoading={thread.isLoading}
        error={thread.error}
        onRetry={thread.refetch}
        actions={actions}
      />
    </StudioDetailLayout>
  );
};
