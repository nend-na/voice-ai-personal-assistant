import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateFollowUpStatus } from "@/lib/services/conversations";

const bodySchema = z.object({
  status: z.enum(["open", "contacted", "completed", "closed"]),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_status", details: parsed.error.issues }, { status: 400 });
  }

  try {
    await updateFollowUpStatus(conversationId, parsed.data.status);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}