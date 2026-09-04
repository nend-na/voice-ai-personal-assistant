import { z } from "zod";
import type { WorkflowField } from "@/types/workflow";

/**
 * This is the schema the model's structured turn output must conform to.
 * It is deliberately narrow: the model is NOT allowed to freely decide what
 * gets written to the database. It can only:
 *  - say something to the customer
 *  - propose values for fields that the workflow actually defines
 *  - name a tool to call, with args, from the fixed tool registry
 *  - signal that the conversation is done
 *
 * See lib/ai/orchestrator.ts for how this gets validated and what happens
 * on a schema failure (never a silent write — always a retry or a safe
 * fallback response).
 */
export const structuredTurnOutputSchema = z.object({
  say: z.string().min(1, "assistant must produce a message to send back"),
  intentKey: z.string().nullable().optional(), // null until the model has classified intent
  extractedFields: z
    .array(
      z.object({
        fieldName: z.string().min(1),
        value: z.string().min(1),
        confidence: z.number().min(0).max(1),
      })
    )
    .default([]),
  toolCall: z
    .object({
      name: z.string().min(1),
      arguments: z.record(z.string(), z.unknown()),
    })
    .nullable()
    .optional(),
  isConversationComplete: z.boolean().default(false),
});

export type StructuredTurnOutput = z.infer<typeof structuredTurnOutputSchema>;

/**
 * Builds a per-conversation Zod schema that validates an extracted field
 * value against what the workflow ACTUALLY declared for that field
 * (type, required-ness, select options). This is what prevents the model
 * from e.g. writing "next Tuesday-ish" into a `date` field, or an option
 * that isn't in a `select` field's allowed list.
 *
 * Returns null (field skipped, not written) rather than throwing, because a
 * single bad extraction should never abort the whole turn — see
 * orchestrator.ts's `validateExtractedFields`.
 */
export function validateFieldValue(
  field: WorkflowField,
  rawValue: string
): { ok: true; value: string } | { ok: false; reason: string } {
  switch (field.fieldType) {
    case "number": {
      const n = Number(rawValue);
      if (Number.isNaN(n)) return { ok: false, reason: "not a number" };
      const rules = field.validationRules as { min?: number; max?: number } | null;
      if (rules?.min !== undefined && n < rules.min) return { ok: false, reason: `below min ${rules.min}` };
      if (rules?.max !== undefined && n > rules.max) return { ok: false, reason: `above max ${rules.max}` };
      return { ok: true, value: String(n) };
    }
    case "date": {
      const d = new Date(rawValue);
      if (Number.isNaN(d.getTime())) return { ok: false, reason: "not a resolvable ISO date" };
      return { ok: true, value: d.toISOString() };
    }
    case "time": {
      if (!/^\d{2}:\d{2}$/.test(rawValue)) return { ok: false, reason: "expected HH:MM" };
      return { ok: true, value: rawValue };
    }
    case "phone": {
      const digits = rawValue.replace(/[^\d+]/g, "");
      if (digits.replace(/\D/g, "").length < 7) return { ok: false, reason: "too short to be a phone number" };
      return { ok: true, value: digits };
    }
    case "select": {
      const options = field.selectOptions ?? [];
      const match = options.find((o) => o.toLowerCase() === rawValue.toLowerCase());
      if (!match) return { ok: false, reason: `"${rawValue}" not in allowed options` };
      return { ok: true, value: match };
    }
    case "text":
    case "address":
    default:
      return rawValue.trim().length > 0
        ? { ok: true, value: rawValue.trim() }
        : { ok: false, reason: "empty" };
  }
}
