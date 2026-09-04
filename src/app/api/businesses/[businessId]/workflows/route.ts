import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/client";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("workflows")
    .select("id, name, status, language")
    .eq("business_id", businessId)
    .neq("status", "archived")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "failed_to_load_workflows" }, { status: 500 });
  }
  return NextResponse.json({ workflows: data ?? [] });
}
