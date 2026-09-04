"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { FollowUpStatus } from "@/lib/services/conversations";

const OPTIONS: { value: FollowUpStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "contacted", label: "Mark contacted" },
  { value: "completed", label: "Mark completed" },
  { value: "closed", label: "Close" },
];

export function FollowUpActions({ conversationId, currentStatus }: { conversationId: string; currentStatus: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<FollowUpStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(status: FollowUpStatus) {
    setPending(status);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/followup`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("failed");
      router.refresh(); // re-runs the server component with the updated status
    } catch {
      setError("Couldn't update the follow-up status. Please try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.filter((o) => o.value !== currentStatus).map((o) => (
          <Button key={o.value} variant="secondary" disabled={pending !== null} onClick={() => handleClick(o.value)}>
            {pending === o.value ? "Updating…" : o.label}
          </Button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
