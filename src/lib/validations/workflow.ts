import { z } from "zod";

// Mirrors src/types/workflow.ts. Used both by the workflow-builder API routes
// (server-side validation of what the business owner submits) and reused by
// the AI layer to validate that generated/extracted values conform to a
// field's declared type before persistence.

export const fieldTypeSchema = z.enum([
  "text",
  "number",
  "date",
  "time",
  "phone",
  "select",
  "address",
]);

export const workflowFieldSchema = z.object({
  fieldName: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_]*$/, "field_name must be snake_case, e.g. required_date"),
  label: z.string().min(1).max(120),
  fieldType: fieldTypeSchema,
  description: z.string().max(500).optional(),
  required: z.boolean().default(false),
  selectOptions: z.array(z.string().min(1)).optional(),
  validationRules: z.record(z.string(), z.unknown()).optional(),
  displayOrder: z.number().int().min(0).default(0),
}).superRefine((field, ctx) => {
  if (field.fieldType === "select" && (!field.selectOptions || field.selectOptions.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "select fields must declare at least one option",
      path: ["selectOptions"],
    });
  }
});

export const conditionOpSchema = z.enum([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "within_hours",
  "contains",
]);

export const conditionDefinitionSchema = z.object({
  field: z.string().min(1),
  op: conditionOpSchema,
  value: z.union([z.string(), z.number()]),
});

export const resultingActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_priority"), value: z.enum(["urgent", "normal"]) }),
  z.object({ type: z.literal("require_field"), field: z.string().min(1) }),
  z.object({
    type: z.literal("trigger_action"),
    actionType: z.enum([
      "create_enquiry",
      "create_followup",
      "notify_owner",
      "create_calendar_event",
      "mark_urgent",
    ]),
  }),
]);

export const workflowConditionSchema = z.object({
  condition: conditionDefinitionSchema,
  resultingAction: resultingActionSchema,
  priority: z.number().int().min(0).default(0),
});

export const workflowActionDefinitionSchema = z.object({
  actionType: z.enum([
    "create_enquiry",
    "create_followup",
    "notify_owner",
    "create_calendar_event",
    "mark_urgent",
  ]),
  config: z.record(z.string(), z.unknown()).optional(),
  triggerOn: z.enum(["completion", "condition_match"]).default("completion"),
});

export const workflowIntentSchema = z.object({
  intentKey: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_]*$/, "intent_key must be snake_case, e.g. order_cake"),
  label: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  displayOrder: z.number().int().min(0).default(0),
  fields: z.array(workflowFieldSchema).min(1, "each intent needs at least one field to collect"),
  conditions: z.array(workflowConditionSchema).default([]),
  actions: z.array(workflowActionDefinitionSchema).min(1, "each intent needs at least one post-completion action"),
});

export const createWorkflowSchema = z.object({
  businessId: z.string().uuid(),
  name: z.string().min(1).max(120),
  trigger: z.enum(["missed_call", "manual", "sms_inbound"]).default("missed_call"),
  greeting: z.string().min(1).max(500),
  assistantRole: z.string().min(1).max(1000),
  tone: z.string().min(1).max(120).default("friendly_professional"),
  restrictions: z.string().max(1000).optional(),
  closingMessage: z.string().min(1).max(500),
  language: z.enum(["en", "hi"]).default("en"),
  intents: z.array(workflowIntentSchema).min(1, "a workflow needs at least one intent"),
});

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type WorkflowFieldInput = z.infer<typeof workflowFieldSchema>;
