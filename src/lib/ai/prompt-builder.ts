import type { Workflow, WorkflowIntent } from "@/types/workflow";
import type { ConversationState } from "@/types/conversation";
import { getFieldGaps } from "@/lib/workflow/engine";
import { getAllTools } from "./tools/registry";

/**
 * Builds the system prompt for a single turn. This is the crux of "the
 * conversation engine is workflow-driven, not hardcoded per business type":
 * every business-specific detail (greeting, tone, fields, restrictions,
 * language) comes from the `workflow` argument — a cake shop and a clinic
 * hit this exact same function, and produce different prompts only because
 * their workflow rows differ, not because of a branch in this code.
 */
export function buildSystemPrompt(workflow: Workflow, state: ConversationState): string {
  const activeIntent = state.workflowIntentId
    ? workflow.intents.find((i) => i.id === state.workflowIntentId) ?? null
    : null;

  const sections = [
    identitySection(workflow),
    languageSection(workflow, state),
    intentClassificationSection(workflow, activeIntent),
    activeIntent ? fieldCollectionSection(activeIntent, state) : null,
    toolSection(),
    restrictionsSection(workflow),
    outputContractSection(),
  ].filter(Boolean);

  return sections.join("\n\n");
}

function identitySection(workflow: Workflow): string {
  return [
    `You are the automated missed-call assistant for this business. ${workflow.assistantRole}`,
    `Tone: ${workflow.tone}.`,
    `Opening greeting to use if this is the first turn: "${workflow.greeting}"`,
    `Closing message to use once the conversation is complete: "${workflow.closingMessage}"`,
  ].join("\n");
}

function languageSection(workflow: Workflow, state: ConversationState): string {
  const lang = state.language ?? workflow.language;
  return lang === "hi"
    ? "Respond in conversational Hindi (Devanagari script) unless the customer switches to English, in which case switch with them. Keep tool-call arguments in English/ISO formats regardless of conversation language (e.g. dates as ISO-8601)."
    : "Respond in English unless the customer switches to Hindi, in which case switch with them, matching the language they are using turn by turn.";
}

function intentClassificationSection(workflow: Workflow, activeIntent: WorkflowIntent | null): string {
  if (activeIntent) {
    return `Classified intent: ${activeIntent.label} (${activeIntent.intentKey}). ${activeIntent.description ?? ""}`;
  }
  const options = workflow.intents
    .map((i) => `- ${i.intentKey}: ${i.label}${i.description ? ` — ${i.description}` : ""}`)
    .join("\n");
  return [
    "The customer's intent has not been classified yet. Based on their message, classify it as ONE of:",
    options,
    'Set `intentKey` in your structured output once you are confident. Do not guess with low confidence — ask one clarifying question if the intent is genuinely ambiguous.',
  ].join("\n");
}

function fieldCollectionSection(intent: WorkflowIntent, state: ConversationState): string {
  const { missingRequired } = getFieldGaps(intent, state.collected);
  const fieldList = intent.fields
    .map((f) => {
      const status = state.collected[f.fieldName] ? `already have: "${state.collected[f.fieldName].value}"` : f.required ? "STILL REQUIRED" : "optional, not yet asked";
      const constraint = f.fieldType === "select" ? ` (must be one of: ${(f.selectOptions ?? []).join(", ")})` : "";
      return `- ${f.fieldName} (${f.fieldType}${constraint}): ${f.description ?? f.label} — ${status}`;
    })
    .join("\n");

  return [
    `Fields to collect for this intent:\n${fieldList}`,
    missingRequired.length > 0
      ? `Ask for ONE missing required field at a time, in a natural way — do not interrogate the customer with a list of questions. Missing required fields, in order: ${missingRequired.join(", ")}.`
      : "All required fields are collected. You may confirm details with the customer and move toward completing the conversation.",
    "When the customer gives you a value for any field, include it in `extractedFields` with your confidence (0-1). Only extract what the customer actually said — never fabricate a value.",
  ].join("\n");
}

function toolSection(): string {
  const tools = getAllTools();
  return [
    "Available tools (call via the `toolCall` field in your structured output, at most one per turn):",
    tools.map((t) => `- ${t.name}: ${t.description}`).join("\n"),
    "Never claim you checked a calendar or looked something up unless you actually called the corresponding tool this turn or a previous turn returned that result. Wait for the tool result before confirming anything to the customer that depends on it.",
  ].join("\n");
}

function restrictionsSection(workflow: Workflow): string {
  if (!workflow.restrictions) return "";
  return `IMPORTANT RESTRICTIONS: ${workflow.restrictions}`;
}

function outputContractSection(): string {
  return [
    "Respond with ONLY a JSON object matching this shape (no prose outside the JSON):",
    `{
  "say": string,                       // what to say to the customer this turn
  "intentKey": string | null,          // set once classified, else null
  "extractedFields": [{ "fieldName": string, "value": string, "confidence": number }],
  "toolCall": { "name": string, "arguments": object } | null,
  "isConversationComplete": boolean    // true only once closing_message has been delivered
}`,
    "If you are calling a tool this turn, set `say` to a brief natural transition (e.g. \"Let me check that for you...\") — the actual confirmation happens next turn once you have the tool result.",
  ].join("\n");
}
