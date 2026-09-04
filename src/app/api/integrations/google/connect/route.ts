import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getAuthUrl } from "@/lib/ai/tools/calendar-oauth";

/**
 * `state` carries the businessId through Google's redirect round trip. It's
 * HMAC-signed (not just base64'd) so the callback route can trust it wasn't
 * tampered with — otherwise a forged state param could let someone attach
 * their Google account's tokens to an arbitrary business_id.
 */
function signState(businessId: string): string {
  const payload = JSON.stringify({ businessId, nonce: crypto.randomBytes(8).toString("hex") });
  const sig = crypto.createHmac("sha256", process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? "").update(payload).digest("hex");
  return Buffer.from(JSON.stringify({ payload, sig })).toString("base64url");
}

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "missing_business_id" }, { status: 400 });
  }
  // TODO: verify the requesting user actually owns businessId (via Supabase
  // auth session) before issuing state — omitted here since auth/session
  // wiring is part of the UI layer not included in this delivery.
  const url = getAuthUrl(signState(businessId));
  return NextResponse.redirect(url);
}
