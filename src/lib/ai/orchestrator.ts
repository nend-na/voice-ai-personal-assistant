import { GoogleGenAI } from "@google/genai";
import type { Workflow, WorkflowIntent } from "@/types/workflow";
import type { ConversationState, Message, OrchestratorTurnResult, ToolEvent, CollectedField } from "@/types/conversation";
import { buildSystemPrompt } from "./prompt-builder";
import { structuredTurnOutputSchema, validateFieldValue } from "@/lib/validations/conversation";
import { runTool } from "./tools/registry";
import { canComplete, resolvePriority, resolveActionsToRun } from "@/lib/workflow/engine";

// Using Google's Gemini API here instead of Anthropic's — Gemini has a
// genuine ongoing free tier (no credit card, rate-limited but real) suitable
// for development/demo use, whereas Anthropic's API is pay-as-you-go after a
// small one-time trial credit. The orchestration logic below (structured
// JSON contract, retry-on-validation-failure, field/tool validation) is
// identical regardless of which model provider sits behind it — that
// separation is exactly why swapping providers only touches this one file's
// API-call plumbing, not prompt-builder.ts, the workflow engine, or any
// validation logic.
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.CONVERSATION_MODEL ?? "gemini-2.5-flash";
const MAX_STRUCTURED_OUTPUT_RETRIES = 2;

// Free-tier Gemini access is prone to short-lived "high demand" 503s that
// have nothing to do with the request itself — retrying a few seconds later
// almost always succeeds. This is separate from MAX_STRUCTURED_OUTPUT_RETRIES
// above, which retries when the MODEL responded but with malformed/invalid
// JSON — a different failure mode with a different fix (telling the model
// what it got wrong), not a network-level retry.
const TRANSIENT_ERROR_RETRIES = 3;
const TRANSIENT_ERROR_BASE_DELAY_MS = 1000;

function isTransientError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b503\b|UNAVAILABLE|\b429\b|RESOURCE_EXHAUSTED|high demand|overloaded/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps a single generateContent call with exponential backoff (1s, 2s, 4s,
 * 8s) for transient errors only. A non-transient error (e.g. a 404 for a
 * deprecated/mistyped model name — which no amount of retrying fixes) is
 * re-thrown immediately rather than retried, since retrying a permanent
 * error just wastes 4 attempts' worth of time before failing anyway.
 */
async function callModelWithRetry(
  params: Parameters<typeof genAI.models.generateContent>[0]
): Promise<Awaited<ReturnType<typeof genAI.models.generateContent>>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= TRANSIENT_ERROR_RETRIES; attempt++) {
    try {
      return await genAI.models.generateContent(params);
    } catch (err) {
      lastErr = err;
      if (!isTransientError(err) || attempt === TRANSIENT_ERROR_RETRIES) throw err;
      const delay = TRANSIENT_ERROR_BASE_DELAY_MS * 2 ** attempt;
      console.warn(
        `Gemini call hit a transient error (attempt ${attempt + 1}/${TRANSIENT_ERROR_RETRIES + 1}), retrying in ${delay}ms:`,
        err instanceof Error ? err.message : err
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}

/**
 * Runs exactly one conversational turn. This function is the enforcement
 * point for "the AI never writes directly to the database": everything the
 * model produces passes through structuredTurnOutputSchema (shape) and then
 * validateFieldValue (per-field, against the workflow's own type/select
 * constraints) before anything is merged into ConversationState. A field the
 * model got wrong is dropped with a warning, not written — the customer
 * simply gets asked again, which is a better failure mode than corrupt data.
 *
 * The function is pure with respect to the DB: it takes state in, returns
 * updated state out, and does NOT persist anything itself. The API route
 * calling this is responsible for persistence, which keeps this testable
 * without a database and keeps "state transition" separate from "storage".
 */
export async function runConversationTurn(
  workflow: Workflow,
  state: ConversationState,
  customerMessage: string
): Promise<OrchestratorTurnResult> {
  const toolEvents: ToolEvent[] = [];
  let currentState = appendMessage(state, "customer", customerMessage);

  const structured = await getStructuredResponse(workflow, currentState);

  // 1. Merge validated field extractions.
  const activeIntentBefore = currentState.workflowIntentId
    ? workflow.intents.find((i) => i.id === currentState.workflowIntentId)
    : structured.intentKey
    ? workflow.intents.find((i) => i.intentKey === structured.intentKey)
    : undefined;

  if (!currentState.workflowIntentId && activeIntentBefore) {
    currentState = { ...currentState, workflowIntentId: activeIntentBefore.id };
  }

  if (activeIntentBefore) {
    currentState = mergeExtractedFields(currentState, activeIntentBefore, structured.extractedFields);
    currentState = { ...currentState, priority: resolvePriority(activeIntentBefore, currentState.collected) };
  }

  // 2. Tool dispatch (at most one tool call per turn, by prompt contract).
  let assistantMessage = structured.say;
  if (structured.toolCall) {
    toolEvents.push({ toolName: structured.toolCall.name, label: describeToolStart(structured.toolCall.name), status: "started" });

    const result = await runTool(structured.toolCall.name, structured.toolCall.arguments, {
      businessId: currentState.businessId,
      conversationId: currentState.conversationId,
      timezone: "Asia/Kolkata", // TODO: source from business.timezone once loaded by caller
      language: currentState.language,
    });

    toolEvents.push({
      toolName: structured.toolCall.name,
      label: result.ok ? "Done" : "Failed",
      status: result.ok ? "success" : "error",
      detail: result.humanSummary,
    });

    // Feed the tool result back to the model for a follow-up turn so the
    // customer-facing message reflects what actually happened, rather than
    // trusting the model's pre-tool-call `say` as the final answer.
    currentState = appendMessage(currentState, "tool", JSON.stringify({ tool: structured.toolCall.name, result }), structured.toolCall.name);
    const followUp = await getStructuredResponse(workflow, currentState);
    assistantMessage = followUp.say;
    if (activeIntentBefore) {
      currentState = mergeExtractedFields(currentState, activeIntentBefore, followUp.extractedFields);
    }
    currentState = { ...currentState, status: followUp.isConversationComplete && activeIntentBefore && canComplete(activeIntentBefore, currentState.collected, true) ? "completed" : currentState.status };
  } else if (activeIntentBefore) {
    currentState = {
      ...currentState,
      status: canComplete(activeIntentBefore, currentState.collected, structured.isConversationComplete) ? "completed" : currentState.status,
    };
  }

  currentState = appendMessage(currentState, "assistant", assistantMessage);

  return {
    assistantMessage,
    updatedState: currentState,
    toolEvents,
    isComplete: currentState.status === "completed",
  };
}

/** Actions to run once a conversation is marked completed — called by the API route after persistence. */
export function getCompletionActions(workflow: Workflow, state: ConversationState): string[] {
  const intent = workflow.intents.find((i) => i.id === state.workflowIntentId);
  if (!intent) return [];
  return resolveActionsToRun(intent, state.collected);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function getStructuredResponse(workflow: Workflow, state: ConversationState) {
  const systemPrompt = buildSystemPrompt(workflow, state);
  const history = state.messages.map(toGeminiContent);

  let lastError: string | null = null;
  for (let attempt = 0; attempt <= MAX_STRUCTURED_OUTPUT_RETRIES; attempt++) {
    const response = await callModelWithRetry({
      model: MODEL,
      contents: history,
      config: {
        systemInstruction:
          attempt === 0
            ? systemPrompt
            : `${systemPrompt}\n\nYour previous response failed validation: ${lastError}. Return ONLY valid JSON matching the required shape.`,
      },
      // Deliberately NOT passing tool/function-calling config here — same
      // reasoning as the Anthropic version this replaced: this orchestrator
      // dispatches tool calls out of the `toolCall` field of the JSON body
      // (see prompt-builder.ts's outputContractSection), not via the
      // provider's native function-calling mechanism. Tool descriptions are
      // surfaced to the model as plain text in the system prompt instead.
    });

    const text = response.text ?? "";
    const jsonText = extractJson(text);

    try {
      const parsed = JSON.parse(jsonText);
      const validated = structuredTurnOutputSchema.safeParse(parsed);
      if (validated.success) return validated.data;
      lastError = validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch (e) {
      lastError = "response was not valid JSON";
    }
  }

  // All retries exhausted — fail safe rather than crash the conversation.
  return {
    say: "Sorry, I'm having trouble processing that right now. Could you repeat that, or would you like me to have someone from the team call you back directly?",
    intentKey: null,
    extractedFields: [],
    toolCall: null,
    isConversationComplete: false,
  };
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) return text.slice(firstBrace, lastBrace + 1);
  return text;
}

function toGeminiContent(m: Message): { role: "user" | "model"; parts: { text: string }[] } {
  if (m.role === "tool") {
    return { role: "user", parts: [{ text: `[TOOL RESULT for ${m.toolName}]: ${m.content}` }] };
  }
  return { role: m.role === "customer" ? "user" : "model", parts: [{ text: m.content }] };
}

function appendMessage(state: ConversationState, role: Message["role"], content: string, toolName?: string): ConversationState {
  const message: Message = {
    id: crypto.randomUUID(),
    conversationId: state.conversationId,
    role,
    content,
    toolName: toolName ?? null,
    toolCallId: null,
    sequence: state.messages.length,
    createdAt: new Date().toISOString(),
  };
  return { ...state, messages: [...state.messages, message] };
}

function mergeExtractedFields(
  state: ConversationState,
  intent: WorkflowIntent,
  extracted: { fieldName: string; value: string; confidence: number }[]
): ConversationState {
  const collected = { ...state.collected };
  for (const item of extracted) {
    const fieldDef = intent.fields.find((f) => f.fieldName === item.fieldName);
    if (!fieldDef) continue; // model tried to write a field the workflow doesn't define — silently ignored, never persisted
    const validation = validateFieldValue(fieldDef, item.value);
    if (!validation.ok) continue; // fails type/format/select constraints — dropped, customer will be asked again
    const entry: CollectedField = { fieldName: item.fieldName, value: validation.value, confidence: item.confidence };
    collected[item.fieldName] = entry;
  }
  return { ...state, collected };
}

function describeToolStart(toolName: string): string {
  const labels: Record<string, string> = {
    check_calendar_availability: "Checking calendar availability...",
    create_calendar_event: "Creating calendar event...",
    update_calendar_event: "Rescheduling calendar event...",
    cancel_calendar_event: "Cancelling calendar event...",
    lookup_customer: "Looking up customer history...",
  };
  return labels[toolName] ?? `Running ${toolName}...`;
}