"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface BusinessOption {
  id: string;
  name: string;
}
interface CalendarStatus {
  connected: boolean;
  email?: string;
  connectedAt?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  google_denied: "Google sign-in was cancelled.",
  missing_params: "The connection attempt was missing required information. Please try again.",
  invalid_state: "This connection link expired or was invalid. Please try connecting again.",
  token_exchange_failed: "Google didn't confirm the connection. Please try again.",
};

export default function IntegrationsSettingsPage() {
  const searchParams = useSearchParams();
  const [businesses, setBusinesses] = useState<BusinessOption[] | null>(null);
  const [businessId, setBusinessId] = useState("");
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/businesses")
      .then((r) => r.json())
      .then((data) => setBusinesses(data.businesses ?? []))
      .catch(() => setBusinesses([]));
  }, []);

  useEffect(() => {
    if (!businessId) {
      setStatus(null);
      return;
    }
    setStatus(null);
    setStatusError(null);
    fetch(`/api/businesses/${businessId}/calendar-status`)
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatusError("Couldn't check the connection status."));
  }, [businessId]);

  const connectedBanner = searchParams.get("connected");
  const errorCode = searchParams.get("error");

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <h1 className="text-lg font-semibold text-ink">Integrations</h1>
      <p className="mt-1 text-sm text-muted">Connect external services a workflow can use, like Google Calendar.</p>

      {connectedBanner === "google_calendar" && (
        <div className="mt-4 border border-success bg-success-subtle px-4 py-3 text-sm text-success">
          Google Calendar connected successfully.
        </div>
      )}
      {errorCode && (
        <div className="mt-4 border border-danger bg-danger-subtle px-4 py-3 text-sm text-danger">
          {ERROR_MESSAGES[errorCode] ?? "Something went wrong connecting Google Calendar. Please try again."}
        </div>
      )}

      <div className="mt-6 border border-hairline bg-surface p-4">
        <label className="block text-xs font-medium text-muted">Business</label>
        <select
          value={businessId}
          onChange={(e) => setBusinessId(e.target.value)}
          className="mt-1 w-full rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink"
        >
          <option value="">
            {businesses === null ? "Loading businesses…" : "Select a business…"}
          </option>
          {(businesses ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        {businessId && (
          <div className="mt-5 flex items-center justify-between border-t border-hairline pt-4">
            <div>
              <p className="text-sm font-medium text-ink">Google Calendar</p>
              {statusError && <p className="mt-1 text-sm text-danger">{statusError}</p>}
              {!statusError && status === null && <p className="mt-1 text-sm text-muted">Checking status…</p>}
              {status?.connected && (
                <p className="mt-1 text-sm text-muted">
                  Connected as <span className="text-ink">{status.email}</span>
                </p>
              )}
              {status && !status.connected && <p className="mt-1 text-sm text-muted">Not connected yet.</p>}
            </div>

            {status?.connected ? (
              <Badge tone="success">Connected</Badge>
            ) : (
              <a href={`/api/integrations/google/connect?businessId=${businessId}`}>
                <Button variant="secondary">Connect</Button>
              </a>
            )}
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-muted">
        Connecting lets workflows for this business check availability, book, reschedule, and cancel calendar
        events automatically. Requires the app owner to have configured Google OAuth credentials in the
        environment — see the README if this button doesn&apos;t redirect to Google.
      </p>
    </div>
  );
}