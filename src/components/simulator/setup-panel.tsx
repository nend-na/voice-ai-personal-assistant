"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface BusinessOption {
  id: string;
  name: string;
  business_type: string;
  is_demo: boolean;
}
interface WorkflowOption {
  id: string;
  name: string;
  status: string;
}

interface SetupPanelProps {
  onStart: (businessId: string, workflowId: string) => void;
  starting: boolean;
}

export function SetupPanel({ onStart, starting }: SetupPanelProps) {
  const [businesses, setBusinesses] = useState<BusinessOption[] | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowOption[] | null>(null);
  const [businessId, setBusinessId] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/businesses")
      .then((r) => r.json())
      .then((data) => setBusinesses(data.businesses ?? []))
      .catch(() => setError("Couldn't load businesses. Check your Supabase configuration."));
  }, []);

  useEffect(() => {
    if (!businessId) {
      setWorkflows(null);
      return;
    }
    setWorkflows(null);
    fetch(`/api/businesses/${businessId}/workflows`)
      .then((r) => r.json())
      .then((data) => setWorkflows(data.workflows ?? []))
      .catch(() => setError("Couldn't load workflows for this business."));
  }, [businessId]);

  if (error) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }

  if (businesses === null) {
    return <div className="mx-auto max-w-md py-16 text-center text-sm text-muted">Loading businesses…</div>;
  }

  if (businesses.length === 0) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-sm text-ink">No businesses yet.</p>
        <p className="mt-1 text-sm text-muted">Create a business profile before testing a workflow here.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="text-lg font-semibold text-ink">Test a workflow</h1>
      <p className="mt-1 text-sm text-muted">
        Simulate a customer&apos;s missed-call conversation exactly as the assistant would run it live.
      </p>

      <label className="mt-6 block text-xs font-medium text-muted">Business</label>
      <select
        value={businessId}
        onChange={(e) => {
          setBusinessId(e.target.value);
          setWorkflowId("");
        }}
        className="mt-1 w-full rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink"
      >
        <option value="">Select a business…</option>
        {businesses.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name} {b.is_demo ? "(demo)" : ""}
          </option>
        ))}
      </select>

      <label className="mt-4 block text-xs font-medium text-muted">Workflow</label>
      <select
        value={workflowId}
        onChange={(e) => setWorkflowId(e.target.value)}
        disabled={!businessId || workflows === null}
        className="mt-1 w-full rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink disabled:bg-paper"
      >
        <option value="">{!businessId ? "Select a business first…" : workflows === null ? "Loading…" : "Select a workflow…"}</option>
        {workflows?.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      {businessId && workflows !== null && workflows.length === 0 && (
        <p className="mt-2 text-sm text-muted">This business has no active workflows yet.</p>
      )}

      <Button
        className="mt-6 w-full"
        disabled={!businessId || !workflowId || starting}
        onClick={() => onStart(businessId, workflowId)}
      >
        {starting ? "Starting…" : "Start simulated call"}
      </Button>
    </div>
  );
}
