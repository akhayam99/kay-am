import { activateWorkflowAgent } from './activateWorkflowAgent';
import { advanceClusterImplementation } from './clusterImplementation';
import { retryStepSummary } from './retryStepSummary';
import { recoverStuckStep } from './recoverStuckStep';
import { attachWorkflowToSession } from './attachWorkflowToSession';
import { deleteStepDef } from './deleteStepDef';
import { deleteWorkflow } from './deleteWorkflow';
import { detachWorkflowFromSession } from './detachWorkflowFromSession';
import { discardWorkflow } from './discardWorkflow';
import { finalizeWorkflowStep } from './finalizeWorkflowStep';
import { generateWorkflowTitle } from './generateWorkflowTitle';
import { loadPhaseRunsForSession } from './loadPhaseRunsForSession';
import { loadPhaseTemplates } from './loadPhaseTemplates';
import { loadStepLibrary } from './loadStepLibrary';
import { maybeAutoAdvanceWorkflow } from './maybeAutoAdvanceWorkflow';
import { continueWorkflowRun } from './continueWorkflowRun';
import { copyWorkflowFromWorkspace } from './copyWorkflowFromWorkspace';
import { orchestrateNextStep } from './orchestrateNextStep';
import { setWorkflowOrchestratorHints } from './setWorkflowOrchestratorHints';
import { setWorkflowOrchestratorRouting } from './setWorkflowOrchestratorRouting';
import { setWorkflowRoleModelOverrides } from './setWorkflowRoleModelOverrides';
import { renameWorkflow } from './renameWorkflow';
import { reorderSessionWorkflows } from './reorderSessionWorkflows';
import { restoreWorkflow } from './restoreWorkflow';
import { retryWorkflowOrchestration } from './retryWorkflowOrchestration';
import { reprocessGoalForWorkflow } from './reprocessGoalForWorkflow';
import { resetWorkflows } from './resetWorkflows';
import { makeWorkflowPreset } from './makeWorkflowPreset';
import { savePhaseTemplate } from './savePhaseTemplate';
import { saveStepDef } from './saveStepDef';
import { advanceScoutTree } from './scoutTree';
import { skipStuckStepAndAdvance } from './skipStuckStepAndAdvance';
import { setWorkflowRunAutoRun } from './setWorkflowRunAutoRun';
import { setWorkflowRunSpendLimit } from './setWorkflowRunSpendLimit';
import { startWorkflowRun } from './startWorkflowRun';
import { stopWorkflowRunNow } from './stopWorkflowRunNow';
import type { GetFn, SetFn } from './types';

export const createWorkflowsSlice = (set: SetFn, get: GetFn) => {
  return {
    loadPhaseTemplates: loadPhaseTemplates(set),
    copyWorkflowFromWorkspace: copyWorkflowFromWorkspace({ set }),
    savePhaseTemplate: savePhaseTemplate(set),
    deleteWorkflow: deleteWorkflow(set, get),
    renameWorkflow: renameWorkflow(set, get),
    makeWorkflowPreset: makeWorkflowPreset(set, get),
    generateWorkflowTitle: generateWorkflowTitle(set, get),
    loadStepLibrary: loadStepLibrary(set),
    saveStepDef: saveStepDef(set),
    deleteStepDef: deleteStepDef(set),
    resetWorkflows: resetWorkflows(set, get),
    loadPhaseRunsForSession: loadPhaseRunsForSession(set),
    attachWorkflowToSession: attachWorkflowToSession(set, get),
    detachWorkflowFromSession: detachWorkflowFromSession(set, get),
    discardWorkflow: discardWorkflow(set, get),
    restoreWorkflow: restoreWorkflow(set, get),
    reorderSessionWorkflows: reorderSessionWorkflows(set, get),
    setWorkflowRunAutoRun: setWorkflowRunAutoRun(set, get),
    setWorkflowRunSpendLimit: setWorkflowRunSpendLimit(set, get),
    startWorkflowRun: startWorkflowRun(set, get),
    stopWorkflowRunNow: stopWorkflowRunNow(set, get),
    reprocessGoalForWorkflow: reprocessGoalForWorkflow(set, get),
    activateWorkflowAgent: activateWorkflowAgent(set, get),
    advanceClusterImplementation: advanceClusterImplementation(set, get),
    finalizeWorkflowStep: finalizeWorkflowStep(set, get),
    skipStuckStepAndAdvance: skipStuckStepAndAdvance(set, get),
    advanceScoutTree: advanceScoutTree(set, get),
    maybeAutoAdvanceWorkflow: maybeAutoAdvanceWorkflow(set, get),
    orchestrateNextStep: orchestrateNextStep(set, get),
    retryWorkflowOrchestration: retryWorkflowOrchestration(set, get),
    continueWorkflowRun: continueWorkflowRun(set, get),
    setWorkflowOrchestratorHints: setWorkflowOrchestratorHints(set, get),
    setWorkflowOrchestratorRouting: setWorkflowOrchestratorRouting(set, get),
    setWorkflowRoleModelOverrides: setWorkflowRoleModelOverrides(set, get),
    retryStepSummary: retryStepSummary(set, get),
    recoverStuckStep: recoverStuckStep(get),
  };
};
