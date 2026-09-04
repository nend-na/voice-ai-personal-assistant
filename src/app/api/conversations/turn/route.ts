import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loadWorkflow } from "@/lib/services/workflows";
import { loadConversationState, createConversation, persistTurnResult, runCompletionActions } from "@/lib/services/conversations";
import { runConversationTurn } from "@/lib/ai/orchestrator";

const requestSchema = z.object({
  conversationId: z.string().uuid().optional(), // omit to start a new conversation
  workflowId: z.string().uuid(),
  businessId: z.string().uuid(),
  mode: z.enum(["simulated", "live_voice", "live_text"]).default("simulated"),
  language: z.enum(["en", "hi"]).default("en"),
  message: z.string().min(1).max(2000),
});

/**
 * This route is deliberately thin: parse/validate the request, load domain
 * objects, hand off to the orchestrator, persist the result, run completion
 * actions if the turn finished the conversation. All the actual decision-
 * making lives in lib/ai and lib/workflow, where it's unit-testable without
 * an HTTP layer.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 400 });
  }
  const { conversationId, workflowId, businessId, mode, language, message } = parsed.data;

  const workflow = await loadWorkflow(workflowId);
  if (!workflow || workflow.businessId !== businessId) {
    return NextResponse.json({ error: "workflow_not_found" }, { status: 404 });
  }

  const state = conversationId
    ? await loadConversationState(conversationId)
    : await createConversation({ businessId, workflowId, mode, language });

  if (!state) {
    return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
  }
  if (state.status !== "in_progress") {
    return NextResponse.json({ error: "conversation_already_closed", status: state.status }, { status: 409 });
  }

  const previousMessageCount = state.messages.length;

  let turnResult;
  try {
    turnResult = await runConversationTurn(workflow, state, message);
  } catch (err) {
 console.error("Orchestrator error:", err);
    // The orchestrator itself fails closed internally (see MAX_STRUCTURED_OUTPUT_RETRIES),
    // so reaching here means something lower-level broke (network, API outage).
    return NextResponse.json(
      { error: "orchestrator_unavailable", message: "The assistant is temporarily unavailable. Please try again shortly." },
      { status: 503 }
    );
  }

  try {
    await persistTurnResult(previousMessageCount, turnResult.updatedState);
  } catch (err) {
    console.error("Failed to persist turn result:", err);
    return NextResponse.json(
      { error: "storage_unavailable", message: "Your message went through, but we couldn't save the update. Please try again." },
      { status: 503 }
    );
  }

  if (turnResult.isComplete) {
    try {
      await runCompletionActions(workflow, turnResult.updatedState);
    } catch (err) {
      // Deliberately NOT surfaced as a request failure: the conversation
      // itself was already validated, completed, and persisted above — the
      // customer should still get their closing message. A completion
      // action failing (e.g. Google Calendar API hiccup) is recorded
      // per-action inside runCompletionActions where possible, but a
      // failure here (e.g. the Postgres insert into `actions` itself
      // failing) means that bookkeeping silently didn't happen. Logged for
      // operational visibility; see README trade-offs for why this isn't
      // retried automatically.
      console.error("Completion actions failed for conversation", turnResult.updatedState.conversationId, err);
    }
  }

  return NextResponse.json({
    conversationId: turnResult.updatedState.conversationId,
    assistantMessage: turnResult.assistantMessage,
    isComplete: turnResult.isComplete,
    priority: turnResult.updatedState.priority,
    workflowIntentId: turnResult.updatedState.workflowIntentId,
    collected: turnResult.updatedState.collected,
    toolEvents: turnResult.toolEvents, // rendered as the simulator's "Checking calendar availability..." feed
  });
}
