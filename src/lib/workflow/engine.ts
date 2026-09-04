import type { WorkflowIntent } from "@/types/workflow";
import type { CollectedField, Priority } from "@/types/conversation";
import { evaluateConditions } from "./conditions";

export interface FieldGapReport {
  missingRequired: string[]; // field_names still required and not yet collected
  allRequiredCollected: boolean;
}

/**
 * Compares what's required by the intent definition against what's been
 * collected so far. This is what the orchestrator's prompt-builder uses to
 * tell the model "these fields are still missing" instead of letting the
 * model decide from memory/conversation-reading alone whether it's done.
 */
export function getFieldGaps(
  intent: WorkflowIntent,
  collected: Record<string, CollectedField>
): FieldGapReport {
  const missingRequired = intent.fields
    .filter((f) => f.required)
    .filter((f) => !collected[f.fieldName])
    .map((f) => f.fieldName)
    .sort((a, b) => {
      const fa = intent.fields.find((f) => f.fieldName === a)!.displayOrder;
      const fb = intent.fields.find((f) => f.fieldName === b)!.displayOrder;
      return fa - fb;
    });

  return { missingRequired, allRequiredCollected: missingRequired.length === 0 };
}

/**
 * Resolves the conversation's priority by running the intent's conditions
 * against currently-collected data. Defaults to "normal" — a workflow with
 * no matching urgency condition should never silently become urgent.
 */
export function resolvePriority(
  intent: WorkflowIntent,
  collected: Record<string, CollectedField>
): Priority {
  const results = evaluateConditions(intent.conditions, collected);
  const priorityAction = results.find((a) => a.type === "set_priority");
  if (priorityAction && priorityAction.type === "set_priority") return priorityAction.value;
  return "normal";
}

/**
 * A conversation is eligible to complete only when:
 *  1. all required fields for the classified intent are collected, AND
 *  2. the model has explicitly signalled completion (isConversationComplete)
 * Both conditions are enforced server-side — the model signalling "done" is
 * necessary but not sufficient; see orchestrator.ts.
 */
export function canComplete(
  intent: WorkflowIntent,
  collected: Record<string, CollectedField>,
  modelSignalledComplete: boolean
): boolean {
  return modelSignalledComplete && getFieldGaps(intent, collected).allRequiredCollected;
}

/**
 * Which post-completion actions should fire for this intent, combining the
 * intent's declared completion-actions with any condition-triggered actions
 * (e.g. a condition that fires create_calendar_event only when urgent).
 * Deduplicated by actionType so a workflow can't double-fire the same action.
 */
export function resolveActionsToRun(
  intent: WorkflowIntent,
  collected: Record<string, CollectedField>
): string[] {
  const fromDefinitions = intent.actions
    .filter((a) => a.triggerOn === "completion")
    .map((a) => a.actionType);

  const fromConditions = evaluateConditions(intent.conditions, collected)
    .filter((a) => a.type === "trigger_action")
    .map((a) => (a.type === "trigger_action" ? a.actionType : null))
    .filter((a): a is string => a !== null);

  return Array.from(new Set([...fromDefinitions, ...fromConditions]));
}
