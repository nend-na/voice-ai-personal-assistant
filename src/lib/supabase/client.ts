import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Two distinct clients, deliberately not interchangeable:
 *
 * - getBrowserClient(): uses NEXT_PUBLIC_SUPABASE_ANON_KEY. Safe to ship to
 *   the client. Every query goes through Postgres RLS policies (see
 *   supabase/schema.sql) scoped to auth.uid() = businesses.owner_id.
 *
 * - getServiceRoleClient(): uses SUPABASE_SERVICE_ROLE_KEY. Server-only
 *   (route handlers, the orchestrator, tool `execute` functions). Bypasses
 *   RLS by design — this is the trust boundary referenced throughout the AI
 *   layer: the LLM never talks to Postgres directly, only through this
 *   client, only after the Zod validation in lib/validations/*.
 *   NEVER import this file from a "use client" component — there is no
 *   runtime guard against that beyond code review discipline, which is a
 *   known trade-off; see README.
 */

export function getBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

let serviceClient: SupabaseClient | null = null;

export function getServiceRoleClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("getServiceRoleClient() must never be called from client-side code.");
  }
  if (!serviceClient) {
    serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
  }
  return serviceClient;
}
