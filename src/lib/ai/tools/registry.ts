import type { AgentTool, ToolExecutionContext, ToolResult } from "./types";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  checkCalendarAvailabilityTool,
  createCalendarEventTool,
  updateCalendarEventTool,
  cancelCalendarEventTool,
} from "./calendar";
import { customerLookupTool } from "./customer-lookup";

/**
 * Adding a new tool = write a file implementing AgentTool + add one line
 * here. Nothing else in the AI layer needs to change: getToolDefinitionsForModel
 * and runTool below both iterate ALL_TOOLS generically.
 */
const ALL_TOOLS: AgentTool<any, any>[] = [
  checkCalendarAvailabilityTool,
  createCalendarEventTool,
  updateCalendarEventTool,
  cancelCalendarEventTool,
  customerLookupTool,
];

const REGISTRY = new Map(ALL_TOOLS.map((t) => [t.name, t]));

export function getTool(name: string): AgentTool<any, any> | undefined {
  return REGISTRY.get(name);
}

export function getAllTools(): AgentTool<any, any>[] {
  return ALL_TOOLS;
}

/**
 * Converts every registered tool into JSON-schema form using the same Zod
 * definitions that back each tool's own argument validation — one source of
 * truth for what a tool accepts. NOT currently wired into the orchestrator's
 * Anthropic API call by design (see orchestrator.ts's `getStructuredResponse`
 * comment: attaching a native `tools` array would let the model return
 * `tool_use` blocks this codebase never parses). Kept as a standalone export
 * for documentation/tooling use — e.g. an internal "what can the AI do"
 * admin view, or a future migration to native tool_use.
 */
export function getToolDefinitionsForModel() {
  return ALL_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: zodToJsonSchema(tool.parameters, tool.name),
  }));
}

/**
 * Validates model-supplied arguments against the tool's own Zod schema
 * before execution — the model's tool-call JSON is never trusted as-is.
 * On validation failure, returns a structured error result (not a throw) so
 * the orchestrator can hand it back to the model as a tool result and let it
 * retry with corrected arguments, exactly like a real API error would.
 */
export async function runTool(
  toolName: string,
  rawArgs: unknown,
  ctx: ToolExecutionContext
): Promise<ToolResult<unknown>> {
  const tool = getTool(toolName);
  if (!tool) {
    return {
      ok: false,
      errorCode: "unknown_tool",
      humanSummary: `Tool "${toolName}" does not exist.`,
    };
  }

  const parsed = tool.parameters.safeParse(rawArgs);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: "invalid_arguments",
      humanSummary: `Arguments for "${toolName}" failed validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    };
  }

  try {
    return await tool.execute(parsed.data, ctx);
  } catch (err) {
    // Unexpected failure (network blip, bug) — never let this crash the turn.
    return {
      ok: false,
      errorCode: "tool_execution_error",
      humanSummary: `Something went wrong running "${toolName}". Falling back to a manual follow-up.`,
    };
  }
}
