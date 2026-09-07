import { slackPostReply } from '../../../features/integrations/slack/client';
import { appendAttribution, isAttributionEnabled } from '../../../shared/utils/attribution';
import { runSlackWrite } from './runSlackWrite';
import type { GetFn, SlackReplyParams } from './types';

export const replyToSlackThread = (get: GetFn) => {
  return async ({ workspaceId, channelId, threadTs, text }: SlackReplyParams): Promise<void> => {
    const attributedText = appendAttribution({
      body: text,
      isEnabled: isAttributionEnabled({ overrides: get().workspaceOverrides[workspaceId] }),
    });
    await runSlackWrite({
      get,
      workspaceId,
      channelId,
      threadTs,
      write: async () => {
        await slackPostReply({ workspaceId, channelId, threadTs, text: attributedText });
      },
    });
  };
};
