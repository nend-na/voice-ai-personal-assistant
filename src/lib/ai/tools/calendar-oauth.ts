import { google } from "googleapis";
import crypto from "node:crypto";
import { getServiceRoleClient } from "@/lib/supabase/client";

/**
 * Google Calendar OAuth flow.
 *
 * Flow:
 *  1. Business owner clicks "Connect Google Calendar" in Settings > Integrations.
 *  2. GET /api/integrations/google/connect redirects to getAuthUrl(businessId).
 *  3. Google redirects back to GET /api/integrations/google/callback with `code` + `state`.
 *  4. That route calls exchangeCodeForTokens(code) and persists the result via
 *     saveConnection(businessId, tokens).
 *  5. Every subsequent calendar tool call uses getAuthorizedClient(businessId),
 *     which transparently refreshes the access token if it's expired.
 *
 * Tokens are encrypted at rest with AES-256-GCM using a server-only secret
 * (GOOGLE_TOKEN_ENCRYPTION_KEY) — never the Supabase anon key, never sent to
 * the client. This file only ever runs server-side (route handlers / the
 * orchestrator), never in a client component.
 */

const SCOPES = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.readonly"];

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
}

/** `state` should be a signed/short-lived token encoding businessId — see route handler for signing. */
export function getAuthUrl(state: string): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline", // required to get a refresh_token
    prompt: "consent", // forces refresh_token on re-consent too
    scope: SCOPES,
    state,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
    throw new Error("Google did not return the expected offline token set");
  }
  return tokens;
}

function encrypt(plaintext: string): string {
  const key = Buffer.from(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? "", "base64");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decrypt(payload: string): string {
  const key = Buffer.from(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? "", "base64");
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export async function saveConnection(
  businessId: string,
  googleAccountEmail: string,
  tokens: { access_token: string; refresh_token: string; expiry_date: number; scope?: string | null }
) {
  const supabase = getServiceRoleClient();
  const { error } = await supabase.from("google_calendar_connections").upsert(
    {
      business_id: businessId,
      google_account_email: googleAccountEmail,
      access_token_enc: encrypt(tokens.access_token),
      refresh_token_enc: encrypt(tokens.refresh_token),
      token_expiry: new Date(tokens.expiry_date).toISOString(),
      scope: tokens.scope ?? SCOPES.join(" "),
      revoked_at: null,
    },
    { onConflict: "business_id" }
  );
  if (error) throw new Error(`Failed to persist Google connection: ${error.message}`);
}

/**
 * Returns an authorized googleapis client for a business, refreshing the
 * access token first if needed. Returns null (not a throw) if the business
 * hasn't connected a calendar or the connection was revoked — the calendar
 * tool turns that into a clean "not connected yet" response instead of a
 * hard failure.
 */
export async function getAuthorizedClient(businessId: string) {
  const supabase = getServiceRoleClient();
  const { data: connection, error } = await supabase
    .from("google_calendar_connections")
    .select("*")
    .eq("business_id", businessId)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !connection) return null;

  const client = getOAuthClient();
  client.setCredentials({
    access_token: decrypt(connection.access_token_enc),
    refresh_token: decrypt(connection.refresh_token_enc),
    expiry_date: new Date(connection.token_expiry).getTime(),
  });

  // googleapis refreshes automatically on API calls when the access token is
  // stale, as long as a refresh_token is set — but we listen for the refresh
  // event so the new access token gets persisted, not silently dropped.
  client.on("tokens", async (newTokens) => {
    if (newTokens.access_token && newTokens.expiry_date) {
      await supabase
        .from("google_calendar_connections")
        .update({
          access_token_enc: encrypt(newTokens.access_token),
          token_expiry: new Date(newTokens.expiry_date).toISOString(),
        })
        .eq("business_id", businessId);
    }
  });

  return { client, calendarId: connection.calendar_id as string };
}
