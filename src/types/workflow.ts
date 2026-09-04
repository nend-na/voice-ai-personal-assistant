// Domain types mirroring supabase/schema.sql.
// Kept hand-written (not generated) so intent is explicit for reviewers;
// in a longer-lived project these would be generated via `supabase gen types`
// and this file would just re-export/narrow them.

export type FieldType =
  | "text"
  | "number"
  | "date"
  | "time"
  | "phone"
  | "select"
  | "address";

export interface WorkflowField {
  id: string;
  workflowIntentId: string;
  fieldName: string;
  label: string;
  fieldType: FieldType;
  description?: string | null;
  required: boolean;
  selectOptions?: string[] | null;
  validationRules?: Record<string, unknown> | null;
  displayOrder: number;
}

// ---- Conditions ------------------------------------------------------------

export type ConditionOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "within_hours" // date field is within N hours from now
  | "contains";

export interface ConditionDefinition {
  field: string; // workflow field_name this condition reads
  op: ConditionOp;
  value: string | number;
}

export type ResultingAction =
  | { type: "set_priority"; value: "urgent" | "normal" }
  | { type: "require_field"; field: string }
  | { type: "trigger_action"; actionType: WorkflowActionType };

export interface WorkflowCondition {
  id: string;
  workflowIntentId: string;
  condition: ConditionDefinition;
  resultingAction: ResultingAction;
  priority: number;
}

// ---- Actions ----------------------------------------------------------------

export type WorkflowActionType =
  | "create_enquiry"
  | "create_followup"
  | "notify_owner"
  | "create_calendar_event"
  | "mark_urgent";

export interface WorkflowActionDefinition {
  id: string;
  workflowIntentId: string;
  actionType: WorkflowActionType;
  config?: Record<string, unknown> | null;
  triggerOn: "completion" | "condition_match";
}

// ---- Intents / Workflow ------------------------------------------------------

export interface WorkflowIntent {
  id: string;
  workflowId: string;
  intentKey: string;
  label: string;
  description?: string | null;
  displayOrder: number;
  fields: WorkflowField[];
  conditions: WorkflowCondition[];
  actions: WorkflowActionDefinition[];
}

export interface Workflow {
  id: string;
  businessId: string;
  name: string;
  trigger: "missed_call" | "manual" | "sms_inbound";
  greeting: string;
  assistantRole: string;
  tone: string;
  restrictions?: string | null;
  closingMessage: string;
  language: "en" | "hi";
  status: "draft" | "active" | "archived";
  intents: WorkflowIntent[];
}

export interface Business {
  id: string;
  ownerId: string;
  name: string;
  businessType: string;
  phoneNumber?: string | null;
  defaultLanguage: "en" | "hi";
  timezone: string;
  isDemo: boolean;
}
