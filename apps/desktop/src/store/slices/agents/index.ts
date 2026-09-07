import { activateNextResolver } from './activateNextResolver';
import { clearAgentAttachments } from './clearAgentAttachments';
import { clearAgentDone } from './clearAgentDone';
import { clearAgentDraft } from './clearAgentDraft';
import { clearAgentQueue } from './clearAgentQueue';
import { deleteAgent } from './deleteAgent';
import { deselectAgent } from './deselectAgent';
import { forceCloseResolver } from './forceCloseResolver';
import { markAgentSeen } from './markAgentSeen';
import { markAgentViewed } from './markAgentViewed';
import { markAllAgentsSeen } from './markAllAgentsSeen';
import { renameAgent } from './renameAgent';
import { selectAgent } from './selectAgent';
import { setAgentAttachments } from './setAgentAttachments';
import { setAgentDraft } from './setAgentDraft';
import { setAgentDone } from './setAgentDone';
import { setAgentEffortOverride } from './setAgentEffortOverride';
import { setAgentKind } from './setAgentKind';
import { setAgentQueue } from './setAgentQueue';
import { setResolverThreadReply } from './setResolverThreadReply';
import { spawnAgent } from './spawnAgent';
import type { GetFn, SetFn } from './types';

export const createAgentsSlice = (set: SetFn, get: GetFn) => {
  return {
    setAgentKind: setAgentKind(set, get),
    setAgentEffortOverride: setAgentEffortOverride(set),
    setAgentDraft: setAgentDraft(set),
    clearAgentDraft: clearAgentDraft(set),
    setAgentAttachments: setAgentAttachments(set),
    clearAgentAttachments: clearAgentAttachments(set),
    setAgentQueue: setAgentQueue(set),
    clearAgentQueue: clearAgentQueue(set),
    selectAgent: selectAgent(set, get),
    deselectAgent: deselectAgent(set),
    markAgentViewed: markAgentViewed(set, get),
    markAgentSeen: markAgentSeen(set, get),
    markAllAgentsSeen: markAllAgentsSeen(set, get),
    setAgentDone: setAgentDone(set, get),
    clearAgentDone: clearAgentDone(set, get),
    renameAgent: renameAgent(set),
    spawnAgent: spawnAgent(set, get),
    deleteAgent: deleteAgent(set, get),
    activateNextResolver: activateNextResolver(set, get),
    forceCloseResolver: forceCloseResolver(set, get),
    setResolverThreadReply: setResolverThreadReply({ set, get }),
  };
};
