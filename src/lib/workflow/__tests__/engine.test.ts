import { describe, it, expect } from "vitest";
import { getFieldGaps, resolvePriority, canComplete, resolveActionsToRun } from "../engine";
import { evaluateCondition } from "../conditions";
import type { WorkflowIntent } from "@/types/workflow";
import type { CollectedField } from "@/types/conversation";

function field(v: string): CollectedField {
  return { fieldName: "x", value: v, confidence: 0.9 };
}

const cakeIntent: WorkflowIntent = {
  id: "intent-1",
  workflowId: "wf-1",
  intentKey: "order_cake",
  label: "Order a cake",
  displayOrder: 0,
  fields: [
    { id: "f1", workflowIntentId: "intent-1", fieldName: "cake_type", label: "Cake type", fieldType: "text", required: true, displayOrder: 0 },
    { id: "f2", workflowIntentId: "intent-1", fieldName: "required_date", label: "Required date", fieldType: "date", required: true, displayOrder: 1 },
    { id: "f3", workflowIntentId: "intent-1", fieldName: "budget", label: "Budget", fieldType: "number", required: false, displayOrder: 2 },
  ],
  conditions: [
    {
      id: "c1",
      workflowIntentId: "intent-1",
      condition: { field: "required_date", op: "within_hours", value: 24 },
      resultingAction: { type: "set_priority", value: "urgent" },
      priority: 0,
    },
  ],
  actions: [
    { id: "a1", workflowIntentId: "intent-1", actionType: "create_enquiry", triggerOn: "completion" },
    { id: "a2", workflowIntentId: "intent-1", actionType: "create_followup", triggerOn: "completion" },
  ],
};

describe("getFieldGaps", () => {
  it("reports both required fields missing when nothing collected", () => {
    const gaps = getFieldGaps(cakeIntent, {});
    expect(gaps.allRequiredCollected).toBe(false);
    expect(gaps.missingRequired).toEqual(["cake_type", "required_date"]);
  });

  it("ignores optional fields when computing completeness", () => {
    const collected = {
      cake_type: field("Chocolate truffle"),
      required_date: field(new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString()),
    };
    const gaps = getFieldGaps(cakeIntent, collected);
    expect(gaps.allRequiredCollected).toBe(true);
    expect(gaps.missingRequired).toEqual([]);
  });
});

describe("evaluateCondition — within_hours", () => {
  it("matches when the date is inside the window", () => {
    const soon = new Date(Date.now() + 1000 * 60 * 60 * 5).toISOString(); // 5h from now
    const result = evaluateCondition(
      { field: "required_date", op: "within_hours", value: 24 },
      { required_date: field(soon) }
    );
    expect(result).toBe(true);
  });

  it("does not match when the date is outside the window", () => {
    const later = new Date(Date.now() + 1000 * 60 * 60 * 72).toISOString(); // 72h from now
    const result = evaluateCondition(
      { field: "required_date", op: "within_hours", value: 24 },
      { required_date: field(later) }
    );
    expect(result).toBe(false);
  });

  it("does not match a date already in the past", () => {
    const past = new Date(Date.now() - 1000 * 60 * 60).toISOString();
    const result = evaluateCondition(
      { field: "required_date", op: "within_hours", value: 24 },
      { required_date: field(past) }
    );
    expect(result).toBe(false);
  });
});

describe("resolvePriority", () => {
  it("returns urgent when the urgency condition matches", () => {
    const soon = new Date(Date.now() + 1000 * 60 * 60 * 3).toISOString();
    const priority = resolvePriority(cakeIntent, {
      cake_type: field("Vanilla"),
      required_date: field(soon),
    });
    expect(priority).toBe("urgent");
  });

  it("defaults to normal when no condition matches", () => {
    const later = new Date(Date.now() + 1000 * 60 * 60 * 96).toISOString();
    const priority = resolvePriority(cakeIntent, {
      cake_type: field("Vanilla"),
      required_date: field(later),
    });
    expect(priority).toBe("normal");
  });

  it("defaults to normal when the condition's field hasn't been collected yet", () => {
    const priority = resolvePriority(cakeIntent, { cake_type: field("Vanilla") });
    expect(priority).toBe("normal");
  });
});

describe("canComplete", () => {
  const complete = {
    cake_type: field("Chocolate"),
    required_date: field(new Date(Date.now() + 1000 * 60 * 60 * 96).toISOString()),
  };

  it("is false if the model hasn't signalled completion, even if fields are complete", () => {
    expect(canComplete(cakeIntent, complete, false)).toBe(false);
  });

  it("is false if the model signals completion but required fields are missing", () => {
    expect(canComplete(cakeIntent, { cake_type: field("Chocolate") }, true)).toBe(false);
  });

  it("is true only when both conditions hold", () => {
    expect(canComplete(cakeIntent, complete, true)).toBe(true);
  });
});

describe("resolveActionsToRun", () => {
  it("includes completion-triggered actions and dedupes", () => {
    const actions = resolveActionsToRun(cakeIntent, {
      cake_type: field("Chocolate"),
      required_date: field(new Date(Date.now() + 1000 * 60 * 60 * 96).toISOString()),
    });
    expect(actions).toEqual(["create_enquiry", "create_followup"]);
  });

  it("adds condition-triggered actions when a matching condition fires trigger_action", () => {
    const intentWithConditionAction: WorkflowIntent = {
      ...cakeIntent,
      conditions: [
        {
          id: "c2",
          workflowIntentId: "intent-1",
          condition: { field: "required_date", op: "within_hours", value: 24 },
          resultingAction: { type: "trigger_action", actionType: "mark_urgent" },
          priority: 0,
        },
      ],
    };
    const soon = new Date(Date.now() + 1000 * 60 * 60 * 2).toISOString();
    const actions = resolveActionsToRun(intentWithConditionAction, {
      cake_type: field("Chocolate"),
      required_date: field(soon),
    });
    expect(actions).toContain("mark_urgent");
    expect(actions).toContain("create_enquiry");
  });
});
