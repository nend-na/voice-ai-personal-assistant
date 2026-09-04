import type { z } from "zod";

/**
 * Every agent tool is a plain object conforming to this shape. The
 * orchestrator never special-cases a tool by name in its control flow
 * (no `if (toolName === "check_calendar_availability")` branching) — it
 * looks the tool up in the registry, validates args against `parameters`,
 * and calls `execute`. This is what lets "add a tool" mean "add a file to
 * lib/ai/tools/ and register it" rather than touching the orchestrator.
 */
export interface AgentTool<TParams = unknown, TResult = unknown> {
  /** Stable identifier the model uses to call this tool, e.g. "check_calendar_availability" */
  name: string;
  /** Sent to the model verbatim — this is the model's only knowledge of what the tool does */
  description: string;
  /** Zod schema — both validates model-supplied args AND generates the JSON schema sent to the LLM API */
  parameters: z.ZodType<TParams>;
  /**
   * Executes the tool. Must never throw for expected failure modes (auth
   * expired, slot unavailable, ambiguous date) — those are returned as
   * `{ ok: false, ... }` so the model can react to them conversationally.
   * Reserve thrown errors for genuinely unexpected failures, which the
   * orchestrator catches and turns into a generic apology + human handoff.
   */
  execute: (
    params: TParams,
    ctx: ToolExecutionContext
  ) => Promise<ToolResult<TResult>>;
}

export interface ToolExecutionContext {
  businessId: string;
  conversationId: string;
  timezone: string;
  language: "en" | "hi";
}

export type ToolResult<T> =
  | { ok: true; data: T; humanSummary: string }
  | { ok: false; errorCode: string; humanSummary: string };
