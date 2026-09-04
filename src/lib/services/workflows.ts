import { getServiceRoleClient } from "@/lib/supabase/client";
import type {
  Workflow,
  WorkflowIntent,
  WorkflowField,
  WorkflowCondition,
  WorkflowActionDefinition,
} from "@/types/workflow";
import { createWorkflowSchema, type CreateWorkflowInput } from "@/lib/validations/workflow";

/**
 * Loads a workflow and its full intent/field/condition/action graph in one
 * round trip (4 queries, not N+1 — see the .in() batching below). Returns
 * null rather than throwing when not found, so callers (API routes) decide
 * the HTTP status rather than this layer assuming one.
 */
export async function loadWorkflow(workflowId: string): Promise<Workflow | null> {
  const supabase = getServiceRoleClient();

  const { data: workflowRow, error: workflowError } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .maybeSingle();
  if (workflowError || !workflowRow) return null;

  const { data: intentRows, error: intentError } = await supabase
    .from("workflow_intents")
    .select("*")
    .eq("workflow_id", workflowId)
    .order("display_order", { ascending: true });
  if (intentError || !intentRows) return null;

  const intentIds = intentRows.map((r) => r.id);
  if (intentIds.length === 0) {
    return { ...mapWorkflowRow(workflowRow), intents: [] };
  }

  const [{ data: fieldRows }, { data: conditionRows }, { data: actionRows }] = await Promise.all([
    supabase.from("workflow_fields").select("*").in("workflow_intent_id", intentIds).order("display_order", { ascending: true }),
    supabase.from("workflow_conditions").select("*").in("workflow_intent_id", intentIds).order("priority", { ascending: true }),
    supabase.from("workflow_actions").select("*").in("workflow_intent_id", intentIds),
  ]);

  const intents: WorkflowIntent[] = intentRows.map((row) => ({
    id: row.id,
    workflowId: row.workflow_id,
    intentKey: row.intent_key,
    label: row.label,
    description: row.description,
    displayOrder: row.display_order,
    fields: (fieldRows ?? []).filter((f) => f.workflow_intent_id === row.id).map(mapFieldRow),
    conditions: (conditionRows ?? []).filter((c) => c.workflow_intent_id === row.id).map(mapConditionRow),
    actions: (actionRows ?? []).filter((a) => a.workflow_intent_id === row.id).map(mapActionRow),
  }));

  return { ...mapWorkflowRow(workflowRow), intents };
}

/**
 * Persists a validated workflow-builder submission. Runs as a single
 * multi-insert sequence rather than a Postgres function/transaction for
 * simplicity here — see README trade-offs for the partial-failure caveat
 * (a production version would wrap this in a `plpgsql` function to get
 * atomicity, since Supabase's JS client doesn't expose multi-statement
 * transactions directly).
 */
export async function createWorkflow(input: CreateWorkflowInput): Promise<{ workflowId: string }> {
  const validated = createWorkflowSchema.parse(input); // throws on invalid input -> caller (route) returns 400
  const supabase = getServiceRoleClient();

  const { data: workflow, error: workflowError } = await supabase
    .from("workflows")
    .insert({
      business_id: validated.businessId,
      name: validated.name,
      trigger: validated.trigger,
      greeting: validated.greeting,
      assistant_role: validated.assistantRole,
      tone: validated.tone,
      restrictions: validated.restrictions ?? null,
      closing_message: validated.closingMessage,
      language: validated.language,
      status: "draft",
    })
    .select("id")
    .single();
  if (workflowError || !workflow) throw new Error(`Failed to create workflow: ${workflowError?.message}`);

  for (const intent of validated.intents) {
    const { data: intentRow, error: intentError } = await supabase
      .from("workflow_intents")
      .insert({
        workflow_id: workflow.id,
        intent_key: intent.intentKey,
        label: intent.label,
        description: intent.description ?? null,
        display_order: intent.displayOrder,
      })
      .select("id")
      .single();
    if (intentError || !intentRow) throw new Error(`Failed to create intent "${intent.intentKey}": ${intentError?.message}`);

    if (intent.fields.length > 0) {
      const { error } = await supabase.from("workflow_fields").insert(
        intent.fields.map((f) => ({
          workflow_intent_id: intentRow.id,
          field_name: f.fieldName,
          label: f.label,
          field_type: f.fieldType,
          description: f.description ?? null,
          required: f.required,
          select_options: f.selectOptions ?? null,
          validation_rules: f.validationRules ?? null,
          display_order: f.displayOrder,
        }))
      );
      if (error) throw new Error(`Failed to create fields for "${intent.intentKey}": ${error.message}`);
    }

    if (intent.conditions.length > 0) {
      const { error } = await supabase.from("workflow_conditions").insert(
        intent.conditions.map((c) => ({
          workflow_intent_id: intentRow.id,
          condition_definition: c.condition,
          resulting_action: c.resultingAction,
          priority: c.priority,
        }))
      );
      if (error) throw new Error(`Failed to create conditions for "${intent.intentKey}": ${error.message}`);
    }

    const { error: actionsError } = await supabase.from("workflow_actions").insert(
      intent.actions.map((a) => ({
        workflow_intent_id: intentRow.id,
        action_type: a.actionType,
        config: a.config ?? null,
        trigger_on: a.triggerOn,
      }))
    );
    if (actionsError) throw new Error(`Failed to create actions for "${intent.intentKey}": ${actionsError.message}`);
  }

  return { workflowId: workflow.id };
}

// ---------------------------------------------------------------------------
// Row -> domain mappers
// ---------------------------------------------------------------------------

function mapWorkflowRow(row: any): Omit<Workflow, "intents"> {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    trigger: row.trigger,
    greeting: row.greeting,
    assistantRole: row.assistant_role,
    tone: row.tone,
    restrictions: row.restrictions,
    closingMessage: row.closing_message,
    language: row.language,
    status: row.status,
  };
}

function mapFieldRow(row: any): WorkflowField {
  return {
    id: row.id,
    workflowIntentId: row.workflow_intent_id,
    fieldName: row.field_name,
    label: row.label,
    fieldType: row.field_type,
    description: row.description,
    required: row.required,
    selectOptions: row.select_options,
    validationRules: row.validation_rules,
    displayOrder: row.display_order,
  };
}

function mapConditionRow(row: any): WorkflowCondition {
  return {
    id: row.id,
    workflowIntentId: row.workflow_intent_id,
    condition: row.condition_definition,
    resultingAction: row.resulting_action,
    priority: row.priority,
  };
}

function mapActionRow(row: any): WorkflowActionDefinition {
  return {
    id: row.id,
    workflowIntentId: row.workflow_intent_id,
    actionType: row.action_type,
    config: row.config,
    triggerOn: row.trigger_on,
  };
}

// ---------------------------------------------------------------------------
// Listing (for the /workflows index page)
// ---------------------------------------------------------------------------

export interface WorkflowSummary {
  id: string;
  name: string;
  status: string;
  businessName: string;
  language: string;
}

export async function listAllWorkflows(): Promise<WorkflowSummary[]> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("workflows")
    .select("id, name, status, language, businesses ( name )")
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data.map((row: any) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    language: row.language,
    businessName: row.businesses?.name ?? "Unknown business",
  }));
}
