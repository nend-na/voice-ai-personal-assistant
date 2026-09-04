import type { ConditionDefinition, WorkflowCondition, ResultingAction } from "@/types/workflow";
import type { CollectedField } from "@/types/conversation";

/**
 * Pure, deterministic condition evaluation. Deliberately kept OUT of the AI
 * layer — priority/urgency decisions must be reproducible and testable
 * without hitting an LLM, and a business owner configuring "if required_date
 * is within 24 hours, mark urgent" needs to trust that rule fires exactly
 * the same way every time.
 */
export function evaluateCondition(
  condition: ConditionDefinition,
  collected: Record<string, CollectedField>
): boolean {
  const field = collected[condition.field];
  if (!field) return false; // field not yet collected -> condition can't be evaluated
  const raw = field.value;

  switch (condition.op) {
    case "eq":
      return raw.toLowerCase() === String(condition.value).toLowerCase();
    case "neq":
      return raw.toLowerCase() !== String(condition.value).toLowerCase();
    case "gt":
      return Number(raw) > Number(condition.value);
    case "gte":
      return Number(raw) >= Number(condition.value);
    case "lt":
      return Number(raw) < Number(condition.value);
    case "lte":
      return Number(raw) <= Number(condition.value);
    case "contains":
      return raw.toLowerCase().includes(String(condition.value).toLowerCase());
    case "within_hours": {
      const target = new Date(raw);
      if (Number.isNaN(target.getTime())) return false;
      const hoursUntil = (target.getTime() - Date.now()) / (1000 * 60 * 60);
      return hoursUntil >= 0 && hoursUntil <= Number(condition.value);
    }
    default:
      return false;
  }
}

/**
 * Evaluates every condition for the active intent, in priority order, and
 * returns the resulting actions that matched. Multiple conditions may match
 * (e.g. one sets priority, another requires an extra field) — this is not a
 * first-match-wins engine, each condition is independent.
 */
export function evaluateConditions(
  conditions: WorkflowCondition[],
  collected: Record<string, CollectedField>
): ResultingAction[] {
  return [...conditions]
    .sort((a, b) => a.priority - b.priority)
    .filter((c) => evaluateCondition(c.condition, collected))
    .map((c) => c.resultingAction);
}
