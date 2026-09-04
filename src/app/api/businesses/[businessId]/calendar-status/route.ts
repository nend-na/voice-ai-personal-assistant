import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/client";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("google_calendar_connections")
    .select("google_account_email, connected_at")
    .eq("business_id", businessId)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "failed_to_check_status" }, { status: 500 });
  }

  return NextResponse.json(
    data
      ? { connected: true, email: data.google_account_email, connectedAt: data.connected_at }
      : { connected: false }
  );
}