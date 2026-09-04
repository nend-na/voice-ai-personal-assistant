import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/client";

// NOTE: no session-auth scoping here (returns all businesses) — this
// delivery doesn't include the auth/session layer. In production this
// would filter by the authenticated owner via the browser client + RLS
// instead of the service-role client. Flagged in README trade-offs.
export async function GET() {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, business_type, default_language, is_demo")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "failed_to_load_businesses" }, { status: 500 });
  }
  return NextResponse.json({ businesses: data ?? [] });
}
