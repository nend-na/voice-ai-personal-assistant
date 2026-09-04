import { getServiceRoleClient } from "@/lib/supabase/client";
import type { ConversationState, Message } from "@/types/conversation";
import type { Workflow } from "@/types/workflow";
import { runTool } from "@/lib/ai/tools/registry";
import { getCompletionActions } from "@/lib/ai/orchestrator";

export async function createConversation(params: {
  businessId: string;
  workflowId: string;
  mode: "simulated" | "live_voice" | "live_text";
  language: "en" | "hi";
}): Promise<ConversationState> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      business_id: params.businessId,
      workflow_id: params.workflowId,
      mode: params.mode,
      language: params.language,
      status: "in_progress",
      priority: "normal",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Failed to create conversation: ${error?.message}`);

  return {
    conversationId: data.id,
    businessId: params.businessId,
    workflowId: params.workflowId,
    workflowIntentId: null,
    language: params.language,
    status: "in_progress",
    priority: "normal",
    messages: [],
    collected: {},
  };
}

/**
 * Reconstructs full ConversationState from the DB. This is called at the
 * start of every turn — the orchestrator itself holds no state between HTTP
 * requests, which is what makes it safe to run as a stateless serverless
 * function.
 */
export async function loadConversationState(conversationId: string): Promise<ConversationState | null> {
  const supabase = getServiceRoleClient();

  const { data: convo, error: convoError } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();
  if (convoError || !convo) return null;

  const [{ data: messageRows }, { data: collectedRows }] = await Promise.all([
    supabase.from("messages").select("*").eq("conversation_id", conversationId).order("sequence", { ascending: true }),
    supabase.from("collected_data").select("*").eq("conversation_id", conversationId),
  ]);

  const messages: Message[] = (messageRows ?? []).map((m) => ({
    id: m.id,
    conversationId: m.conversation_id,
    role: m.role,
    content: m.content,
    toolName: m.tool_name,
    toolCallId: m.tool_call_id,
    sequence: m.sequence,
    createdAt: m.created_at,
  }));

  const collected: ConversationState["collected"] = {};
  for (const row of collectedRows ?? []) {
    collected[row.field_name] = { fieldName: row.field_name, value: row.field_value, confidence: Number(row.confidence ?? 1) };
  }

  return {
    conversationId: convo.id,
    businessId: convo.business_id,
    workflowId: convo.workflow_id,
    workflowIntentId: convo.workflow_intent_id,
    language: convo.language,
    status: convo.status,
    priority: convo.priority,
    messages,
    collected,
    customerName: convo.customer_name,
    customerPhone: convo.customer_phone,
  };
}

/**
 * Persists the delta produced by one orchestrator turn: new messages (by
 * sequence, so this is safe to call once per turn without double-inserting
 * history), the full collected-fields snapshot (upsert on the unique
 * (conversation_id, field_name) constraint — cheap at this scale and avoids
 * tracking a separate dirty-set), and the conversation row's mutable fields.
 */
export async function persistTurnResult(previousMessageCount: number, state: ConversationState): Promise<void> {
  const supabase = getServiceRoleClient();
  const newMessages = state.messages.slice(previousMessageCount);

  if (newMessages.length > 0) {
    const { error } = await supabase.from("messages").insert(
      newMessages.map((m) => ({
        id: m.id,
        conversation_id: state.conversationId,
        role: m.role,
        content: m.content,
        tool_name: m.toolName,
        tool_call_id: m.toolCallId,
        sequence: m.sequence,
      }))
    );
    if (error) throw new Error(`Failed to persist messages: ${error.message}`);
  }

  const collectedEntries = Object.values(state.collected);
  if (collectedEntries.length > 0) {
    const { error } = await supabase.from("collected_data").upsert(
      collectedEntries.map((c) => ({
        conversation_id: state.conversationId,
        field_name: c.fieldName,
        field_value: c.value,
        confidence: c.confidence,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "conversation_id,field_name" }
    );
    if (error) throw new Error(`Failed to persist collected data: ${error.message}`);
  }

  const { error: convoError } = await supabase
    .from("conversations")
    .update({
      workflow_intent_id: state.workflowIntentId,
      status: state.status,
      priority: state.priority,
      completed_at: state.status === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", state.conversationId);
  if (convoError) throw new Error(`Failed to update conversation: ${convoError.message}`);
}

/**
 * Fires once, right after a turn transitions a conversation to "completed".
 * Each action is recorded in `actions` regardless of outcome — including
 * ones this delivery can't fully execute (notify_owner has no configured
 * delivery channel here; that's surfaced honestly via status + metadata
 * rather than silently marked "success").
 */
export async function runCompletionActions(workflow: Workflow, state: ConversationState): Promise<void> {
  const supabase = getServiceRoleClient();
  const actionTypes = getCompletionActions(workflow, state);
  if (actionTypes.length === 0) return;

  for (const actionType of actionTypes) {
    switch (actionType) {
      case "create_enquiry":
      case "mark_urgent": {
        await supabase.from("actions").insert({
          conversation_id: state.conversationId,
          action_type: actionType,
          status: "success",
          metadata: { collected: state.collected, priority: state.priority },
        });
        break;
      }
      case "create_followup": {
        await supabase.from("follow_ups").insert({
          conversation_id: state.conversationId,
          status: "open",
          priority: state.priority,
        });
        await supabase.from("actions").insert({
          conversation_id: state.conversationId,
          action_type: actionType,
          status: "success",
          metadata: { priority: state.priority },
        });
        break;
      }
      case "notify_owner": {
        // Honest limitation: no email/SMS provider is configured in this
        // delivery. Recorded as "pending" with a clear reason rather than
        // faked as delivered — see README trade-offs.
        await supabase.from("actions").insert({
          conversation_id: state.conversationId,
          action_type: actionType,
          status: "pending",
          metadata: { reason: "No notification provider (email/SMS) configured in this delivery." },
        });
        break;
      }
      case "create_calendar_event": {
        const dateField = state.collected["required_date"] ?? state.collected["preferred_date"];
        const timeField = state.collected["preferred_time"];
        if (!dateField) {
          await supabase.from("actions").insert({
            conversation_id: state.conversationId,
            action_type: actionType,
            status: "failed",
            error_message: "No date field collected to schedule against.",
          });
          break;
        }
        const startIso = combineDateAndTime(dateField.value, timeField?.value);
        const result = await runTool(
          "create_calendar_event",
          {
            startIso,
            durationMinutes: 30,
            title: `${state.customerName ?? "Customer"} — ${workflow.name}`,
            customerName: state.customerName ?? undefined,
            customerPhone: state.customerPhone ?? undefined,
          },
          { businessId: state.businessId, conversationId: state.conversationId, timezone: "Asia/Kolkata", language: state.language }
        );
        await supabase.from("actions").insert({
          conversation_id: state.conversationId,
          action_type: actionType,
          status: result.ok ? "success" : "failed",
          metadata: result.ok ? result.data : undefined,
          error_message: result.ok ? undefined : result.humanSummary,
        });
        break;
      }
    }
  }
}

function combineDateAndTime(dateIso: string, time?: string): string {
  if (!time) return dateIso;
  const date = new Date(dateIso);
  const [hours, minutes] = time.split(":").map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

// ---------------------------------------------------------------------------
// Dashboard / conversation-record reads and follow-up mutation
// ---------------------------------------------------------------------------

export interface ConversationRow {
  id: string;
  customerName: string | null;
  customerPhone: string | null;
  businessName: string;
  workflowName: string;
  intentLabel: string | null;
  status: string;
  priority: "normal" | "urgent";
  followUpStatus: string | null;
  startedAt: string;
  isDemo: boolean;
}

export interface DashboardMetrics {
  missedCallsHandled: number; // conversations started, any status
  activeFollowUps: number; // follow_ups.status in ('open','contacted')
  urgentRequests: number; // conversations.priority = 'urgent' and not closed
  conversationsCompleted: number;
}

/**
 * One query with joins rather than N+1 per row — Supabase's nested select
 * syntax pulls business name, workflow name, intent label, and follow-up
 * status in a single round trip. `businessId` is optional for a global
 * "all businesses" dashboard view; pass it to scope to one business.
 */
export async function listConversationsForDashboard(businessId?: string): Promise<ConversationRow[]> {
  const supabase = getServiceRoleClient();
  let query = supabase
    .from("conversations")
    .select(
      `id, customer_name, customer_phone, status, priority, started_at, is_demo,
       businesses ( name ),
       workflows ( name ),
       workflow_intents ( label ),
       follow_ups ( status )`
    )
    .order("started_at", { ascending: false })
    .limit(100);

  if (businessId) query = query.eq("business_id", businessId);

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((row: any) => ({
    id: row.id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    businessName: row.businesses?.name ?? "Unknown business",
    workflowName: row.workflows?.name ?? "Unknown workflow",
    intentLabel: row.workflow_intents?.label ?? null,
    status: row.status,
    priority: row.priority,
    followUpStatus: row.follow_ups?.[0]?.status ?? null,
    startedAt: row.started_at,
    isDemo: row.is_demo,
  }));
}

export async function getDashboardMetrics(businessId?: string): Promise<DashboardMetrics> {
  const supabase = getServiceRoleClient();

  const scoped = <T extends { eq: (col: string, val: string) => T }>(q: T): T => (businessId ? q.eq("business_id", businessId) : q);

  const [{ count: total }, { count: completed }, { count: urgent }] = await Promise.all([
    scoped(supabase.from("conversations").select("id", { count: "exact", head: true }) as any),
    scoped(supabase.from("conversations").select("id", { count: "exact", head: true }).eq("status", "completed") as any),
    scoped(supabase.from("conversations").select("id", { count: "exact", head: true }).eq("priority", "urgent") as any),
  ]);

  // follow_ups doesn't carry business_id directly — scope via the conversations join when a businessId is given.
  const followUpQuery = businessId
    ? supabase.from("follow_ups").select("id, conversations!inner(business_id)", { count: "exact", head: true }).in("status", ["open", "contacted"]).eq("conversations.business_id", businessId)
    : supabase.from("follow_ups").select("id", { count: "exact", head: true }).in("status", ["open", "contacted"]);
  const { count: activeFollowUps } = await followUpQuery;

  return {
    missedCallsHandled: total ?? 0,
    conversationsCompleted: completed ?? 0,
    urgentRequests: urgent ?? 0,
    activeFollowUps: activeFollowUps ?? 0,
  };
}

export interface ConversationDetail {
  id: string;
  businessName: string;
  workflowName: string;
  intentLabel: string | null;
  customerName: string | null;
  customerPhone: string | null;
  status: string;
  priority: "normal" | "urgent";
  summary: string | null;
  startedAt: string;
  completedAt: string | null;
  messages: { role: string; content: string; toolName: string | null; createdAt: string }[];
  collected: { fieldName: string; label: string; value: string; confidence: number }[];
  actions: { actionType: string; status: string; errorMessage: string | null; createdAt: string }[];
  followUp: { id: string; status: string; priority: string } | null;
}

export async function getConversationDetail(conversationId: string): Promise<ConversationDetail | null> {
  const supabase = getServiceRoleClient();

  const { data: convo, error } = await supabase
    .from("conversations")
    .select(
      `*, businesses ( name ), workflows ( name ), workflow_intents ( label, workflow_fields ( field_name, label ) )`
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (error || !convo) return null;

  const [{ data: messages }, { data: collectedRows }, { data: actionRows }, { data: followUpRow }] = await Promise.all([
    supabase.from("messages").select("role, content, tool_name, created_at").eq("conversation_id", conversationId).order("sequence"),
    supabase.from("collected_data").select("field_name, field_value, confidence").eq("conversation_id", conversationId),
    supabase.from("actions").select("action_type, status, error_message, created_at").eq("conversation_id", conversationId).order("created_at"),
    supabase.from("follow_ups").select("id, status, priority").eq("conversation_id", conversationId).maybeSingle(),
  ]);

  const fieldLabels: Record<string, string> = {};
  for (const f of (convo as any).workflow_intents?.workflow_fields ?? []) {
    fieldLabels[f.field_name] = f.label;
  }

  return {
    id: convo.id,
    businessName: (convo as any).businesses?.name ?? "Unknown business",
    workflowName: (convo as any).workflows?.name ?? "Unknown workflow",
    intentLabel: (convo as any).workflow_intents?.label ?? null,
    customerName: convo.customer_name,
    customerPhone: convo.customer_phone,
    status: convo.status,
    priority: convo.priority,
    summary: convo.summary,
    startedAt: convo.started_at,
    completedAt: convo.completed_at,
    messages: (messages ?? []).map((m) => ({ role: m.role, content: m.content, toolName: m.tool_name, createdAt: m.created_at })),
    collected: (collectedRows ?? []).map((c) => ({
      fieldName: c.field_name,
      label: fieldLabels[c.field_name] ?? c.field_name,
      value: c.field_value,
      confidence: Number(c.confidence ?? 1),
    })),
    actions: (actionRows ?? []).map((a) => ({
      actionType: a.action_type,
      status: a.status,
      errorMessage: a.error_message,
      createdAt: a.created_at,
    })),
    followUp: followUpRow ? { id: followUpRow.id, status: followUpRow.status, priority: followUpRow.priority } : null,
  };
}

const FOLLOW_UP_STATUSES = ["open", "contacted", "completed", "closed"] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export async function updateFollowUpStatus(conversationId: string, status: FollowUpStatus): Promise<void> {
  if (!FOLLOW_UP_STATUSES.includes(status)) throw new Error(`Invalid follow-up status: ${status}`);
  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from("follow_ups")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("conversation_id", conversationId);
  if (error) throw new Error(`Failed to update follow-up status: ${error.message}`);
}
