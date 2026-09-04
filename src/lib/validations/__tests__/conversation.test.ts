import { describe, it, expect } from "vitest";
import { structuredTurnOutputSchema, validateFieldValue } from "../conversation";
import type { WorkflowField } from "@/types/workflow";

describe("structuredTurnOutputSchema", () => {
  it("accepts a minimal valid turn with no tool call", () => {
    const result = structuredTurnOutputSchema.safeParse({
      say: "Sure, what flavour would you like?",
      intentKey: "order_cake",
      extractedFields: [{ fieldName: "cake_type", value: "Birthday cake", confidence: 0.9 }],
      toolCall: null,
      isConversationComplete: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a response with no `say`", () => {
    const result = structuredTurnOutputSchema.safeParse({ say: "", extractedFields: [] });
    expect(result.success).toBe(false);
  });

  it("rejects an extracted field with confidence out of [0,1]", () => {
    const result = structuredTurnOutputSchema.safeParse({
      say: "Got it.",
      extractedFields: [{ fieldName: "budget", value: "5000", confidence: 1.5 }],
    });
    expect(result.success).toBe(false);
  });

  it("defaults extractedFields to [] and isConversationComplete to false when omitted", () => {
    const result = structuredTurnOutputSchema.parse({ say: "Hello!" });
    expect(result.extractedFields).toEqual([]);
    expect(result.isConversationComplete).toBe(false);
    expect(result.toolCall).toBeUndefined();
  });

  it("accepts a tool call with an arbitrary arguments object (validated separately by the tool's own schema)", () => {
    const result = structuredTurnOutputSchema.safeParse({
      say: "Let me check that.",
      toolCall: { name: "check_calendar_availability", arguments: { startIso: "2026-09-03T16:00:00+05:30" } },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed tool call missing `name`", () => {
    const result = structuredTurnOutputSchema.safeParse({
      say: "Let me check.",
      toolCall: { arguments: {} },
    });
    expect(result.success).toBe(false);
  });
});

describe("validateFieldValue", () => {
  const numberField: WorkflowField = {
    id: "f1", workflowIntentId: "i1", fieldName: "weight", label: "Weight", fieldType: "number",
    required: true, displayOrder: 0, validationRules: { min: 0.5, max: 20 },
  };
  const selectField: WorkflowField = {
    id: "f2", workflowIntentId: "i1", fieldName: "flavour", label: "Flavour", fieldType: "select",
    required: true, displayOrder: 1, selectOptions: ["Chocolate", "Vanilla", "Red Velvet"],
  };
  const dateField: WorkflowField = {
    id: "f3", workflowIntentId: "i1", fieldName: "required_date", label: "Required date", fieldType: "date",
    required: true, displayOrder: 2,
  };
  const phoneField: WorkflowField = {
    id: "f4", workflowIntentId: "i1", fieldName: "customer_phone", label: "Phone", fieldType: "phone",
    required: true, displayOrder: 3,
  };
  const timeField: WorkflowField = {
    id: "f5", workflowIntentId: "i1", fieldName: "preferred_time", label: "Time", fieldType: "time",
    required: true, displayOrder: 4,
  };

  it("accepts a number within range", () => {
    const result = validateFieldValue(numberField, "2");
    expect(result).toEqual({ ok: true, value: "2" });
  });

  it("rejects a non-numeric value for a number field", () => {
    const result = validateFieldValue(numberField, "two kilos");
    expect(result.ok).toBe(false);
  });

  it("rejects a number below the field's declared min", () => {
    const result = validateFieldValue(numberField, "0.1");
    expect(result.ok).toBe(false);
  });

  it("rejects a number above the field's declared max", () => {
    const result = validateFieldValue(numberField, "50");
    expect(result.ok).toBe(false);
  });

  it("accepts a select value that case-insensitively matches an option, normalizing casing", () => {
    const result = validateFieldValue(selectField, "chocolate");
    expect(result).toEqual({ ok: true, value: "Chocolate" });
  });

  it("rejects a select value not in the declared options — this is the guardrail that stops the model inventing an option", () => {
    const result = validateFieldValue(selectField, "Mango");
    expect(result.ok).toBe(false);
  });

  it("accepts a resolvable ISO date and normalizes it", () => {
    const result = validateFieldValue(dateField, "2026-09-10T18:00:00+05:30");
    expect(result.ok).toBe(true);
  });

  it("rejects an unresolvable date string — the model must resolve relative dates itself, not push 'tomorrow-ish' through", () => {
    const result = validateFieldValue(dateField, "sometime next week probably");
    expect(result.ok).toBe(false);
  });

  it("accepts a valid HH:MM time", () => {
    expect(validateFieldValue(timeField, "16:00")).toEqual({ ok: true, value: "16:00" });
  });

  it("rejects a time not in HH:MM format", () => {
    expect(validateFieldValue(timeField, "4 PM").ok).toBe(false);
  });

  it("accepts a phone number and strips formatting", () => {
    const result = validateFieldValue(phoneField, "+91 98765 43210");
    expect(result).toEqual({ ok: true, value: "+919876543210" });
  });

  it("rejects a phone number that's too short", () => {
    expect(validateFieldValue(phoneField, "12345").ok).toBe(false);
  });

  it("rejects an empty text value", () => {
    const textField: WorkflowField = {
      id: "f6", workflowIntentId: "i1", fieldName: "custom_message", label: "Message", fieldType: "text",
      required: false, displayOrder: 5,
    };
    expect(validateFieldValue(textField, "   ").ok).toBe(false);
  });
});
