export type MessageRole = "customer" | "assistant" | "system" | "tool";

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  toolName?: string | null;
  toolCallId?: string | null;
  sequence: number;
  createdAt: string;
}

export type Priority = "normal" | "urgent";
export type ConversationStatus = "in_progress" | "completed" | "abandoned" | "failed";

export interface CollectedField {
  fieldName: string;
  value: string;
  confidence: number; // 0..1, from the structured extractor
}

/**
 * The full in-memory state the orchestrator reasons over for a single turn.
 * This is reconstructed from the DB at the start of each turn and persisted
 * back at the end — the orchestrator itself is stateless between HTTP calls,
 * which is what lets it run as a serverless function.
 */
export interface ConversationState {
  conversationId: string;
  businessId: string;
  workflowId: string;
  workflowIntentId: string | null; // null until intent is classified
  language: "en" | "hi";
  status: ConversationStatus;
  priority: Priority;
  messages: Message[];
  collected: Record<string, CollectedField>;
  customerName?: string | null;
  customerPhone?: string | null;
}

/** What the orchestrator returns to the API route after one turn. */
export interface OrchestratorTurnResult {
  assistantMessage: string;
  updatedState: ConversationState;
  toolEvents: ToolEvent[];
  isComplete: boolean;
}

/** Observable (non-chain-of-thought) event shown live in the simulator UI. */
export interface ToolEvent {
  toolName: string;
  label: string; // e.g. "Checking calendar availability..."
  status: "started" | "success" | "error";
  detail?: string;
}
