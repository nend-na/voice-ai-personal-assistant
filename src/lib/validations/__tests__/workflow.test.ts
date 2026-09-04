import { describe, it, expect } from "vitest";
import { createWorkflowSchema, workflowFieldSchema } from "../workflow";

const validField = {
  fieldName: "cake_type",
  label: "Cake type",
  fieldType: "text" as const,
  required: true,
};

const baseWorkflow = {
  businessId: "11111111-1111-1111-1111-111111111111",
  name: "Missed Call — Cake Enquiry",
  greeting: "Hi, thanks for calling!",
  assistantRole: "You help customers order cakes.",
  closingMessage: "Thanks, we'll be in touch.",
  intents: [
    {
      intentKey: "order_cake",
      label: "Order a cake",
      fields: [validField],
      actions: [{ actionType: "create_enquiry" as const }],
    },
  ],
};

describe("workflowFieldSchema", () => {
  it("accepts a well-formed field", () => {
    expect(workflowFieldSchema.safeParse(validField).success).toBe(true);
  });

  it("rejects a field_name that isn't snake_case", () => {
    const result = workflowFieldSchema.safeParse({ ...validField, fieldName: "Cake Type" });
    expect(result.success).toBe(false);
  });

  it("requires at least one select option when fieldType is 'select'", () => {
    const result = workflowFieldSchema.safeParse({ ...validField, fieldType: "select", selectOptions: [] });
    expect(result.success).toBe(false);
  });

  it("accepts a select field with options provided", () => {
    const result = workflowFieldSchema.safeParse({ ...validField, fieldType: "select", selectOptions: ["Chocolate", "Vanilla"] });
    expect(result.success).toBe(true);
  });
});

describe("createWorkflowSchema", () => {
  it("accepts a minimal valid workflow", () => {
    expect(createWorkflowSchema.safeParse(baseWorkflow).success).toBe(true);
  });

  it("rejects a workflow with zero intents", () => {
    const result = createWorkflowSchema.safeParse({ ...baseWorkflow, intents: [] });
    expect(result.success).toBe(false);
  });

  it("rejects an intent with zero fields — every intent must collect something", () => {
    const result = createWorkflowSchema.safeParse({
      ...baseWorkflow,
      intents: [{ ...baseWorkflow.intents[0], fields: [] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an intent with zero completion actions — a workflow that collects data and does nothing with it is a builder mistake, not a valid draft", () => {
    const result = createWorkflowSchema.safeParse({
      ...baseWorkflow,
      intents: [{ ...baseWorkflow.intents[0], actions: [] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid businessId (not a UUID)", () => {
    const result = createWorkflowSchema.safeParse({ ...baseWorkflow, businessId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("defaults trigger to 'missed_call' and language to 'en' when omitted", () => {
    const parsed = createWorkflowSchema.parse(baseWorkflow);
    expect(parsed.trigger).toBe("missed_call");
    expect(parsed.language).toBe("en");
  });
});
