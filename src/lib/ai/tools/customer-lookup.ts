import { z } from "zod";
import type { AgentTool, ToolResult } from "./types";
import { getServiceRoleClient } from "@/lib/supabase/client";

/**
 * Bonus external-style tool. Rather than wrap a public API that has nothing
 * real to say about "is this a repeat customer" (most free CRM/lookup APIs
 * are either unrelated or paywalled), this queries our own `conversations`
 * table by phone number — which is exactly the kind of internal-service tool
 * a real deployment would have (a CRM lookup), implemented against data we
 * actually own. It follows the same AgentTool contract as the Calendar
 * tools, so swapping it for a real third-party CRM API later is a matter of
 * changing `execute`, not the orchestrator or prompt.
 */
const lookupParams = z.object({
  phoneNumber: z.string().min(7).max(20),
});
type LookupParams = z.infer<typeof lookupParams>;

interface LookupResult {
  isRepeatCustomer: boolean;
  priorConversationCount: number;
  lastIntent?: string;
  lastContactedAt?: string;
}

export const customerLookupTool: AgentTool<LookupParams, LookupResult> = {
  name: "lookup_customer",
  description:
    "Looks up a customer by phone number to check if they've contacted this business before, and what about. Use this early in the conversation once you have the customer's phone number, so you can personalize the greeting for repeat customers (e.g. 'Welcome back!').",
  parameters: lookupParams,
  async execute({ phoneNumber }, ctx): Promise<ToolResult<LookupResult>> {
    const supabase = getServiceRoleClient();
    const normalized = phoneNumber.replace(/[^\d+]/g, "");

    const { data, error } = await supabase
      .from("conversations")
      .select("workflow_intent_id, started_at, status")
      .eq("business_id", ctx.businessId)
      .eq("customer_phone", normalized)
      .neq("id", ctx.conversationId)
      .order("started_at", { ascending: false })
      .limit(5);

    if (error) {
      return {
        ok: false,
        errorCode: "lookup_failed",
        humanSummary: "I couldn't check prior history for this number, but I can still help.",
      };
    }

    const priorConversationCount = data?.length ?? 0;
    const isRepeatCustomer = priorConversationCount > 0;

    return {
      ok: true,
      data: {
        isRepeatCustomer,
        priorConversationCount,
        lastIntent: data?.[0]?.workflow_intent_id ?? undefined,
        lastContactedAt: data?.[0]?.started_at ?? undefined,
      },
      humanSummary: isRepeatCustomer
        ? `This number has contacted the business ${priorConversationCount} time(s) before.`
        : "This appears to be a new customer.",
    };
  },
};
