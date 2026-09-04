import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { google } from "googleapis";
import { exchangeCodeForTokens, saveConnection } from "@/lib/ai/tools/calendar-oauth";

function verifyState(state: string): { businessId: string } | null {
  try {
    const { payload, sig } = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    const expected = crypto.createHmac("sha256", process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? "").update(payload).digest("hex");
    // Constant-time comparison — avoids leaking signature-match timing.
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const { businessId } = JSON.parse(payload);
    return { businessId };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (oauthError) {
    return NextResponse.redirect(`${appUrl}/settings/integrations?error=google_denied`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/settings/integrations?error=missing_params`);
  }

  const verified = verifyState(state);
  if (!verified) {
    return NextResponse.redirect(`${appUrl}/settings/integrations?error=invalid_state`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    // Fetch the connected Google account's email for display in Settings.
    const client = new google.auth.OAuth2();
    client.setCredentials(tokens);
    const userinfo = await google.oauth2({ version: "v2", auth: client }).userinfo.get();

    await saveConnection(verified.businessId, userinfo.data.email ?? "unknown", {
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token!,
      expiry_date: tokens.expiry_date!,
      scope: tokens.scope,
    });

    return NextResponse.redirect(`${appUrl}/settings/integrations?connected=google_calendar`);
  } catch (err) {
    console.error("Google OAuth callback failed:", err);
    return NextResponse.redirect(`${appUrl}/settings/integrations?error=token_exchange_failed`);
  }
}
