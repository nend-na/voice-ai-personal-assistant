"use client";

import { Badge } from "@/components/ui/badge";
import type { Workflow, WorkflowField } from "@/types/workflow";
import type { ToolEvent } from "@/types/conversation";

interface LiveStatePanelProps {
  workflow: Workflow | null;
  intentId: string | null;
  collected: Record<string, { value: string; confidence: number }>;
  priority: "normal" | "urgent";
  toolEvents: ToolEvent[];
  isComplete: boolean;
}

export function LiveStatePanel({ workflow, intentId, collected, priority, toolEvents, isComplete }: LiveStatePanelProps) {
  const intent = workflow?.intents.find((i) => i.id === intentId) ?? null;

  return (
    <aside className="flex h-full flex-col border-l border-hairline bg-surface">
      <div className="border-b border-hairline px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Live workflow state</h2>
        <p className="mt-0.5 font-mono text-xs text-muted">Updates as the conversation progresses</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <Field label="Intent">
          {intent ? (
            <span className="text-sm text-ink">{intent.label}</span>
          ) : (
            <span className="text-sm text-muted">Not yet classified</span>
          )}
        </Field>

        <Field label="Priority">
          <Badge tone={priority === "urgent" ? "urgent" : "muted"}>{priority === "urgent" ? "Urgent" : "Normal"}</Badge>
        </Field>

        <Field label="Collected fields">
          {intent ? (
            <ul className="space-y-1.5">
              {intent.fields.map((f) => (
                <FieldRow key={f.fieldName} field={f} entry={collected[f.fieldName]} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Fields will appear once the customer&apos;s intent is known.</p>
          )}
        </Field>

        <Field label="Tool activity">
          {toolEvents.length === 0 ? (
            <p className="text-sm text-muted">No tools called yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {toolEvents.map((event, i) => (
                <li key={i} className="flex items-start gap-2 font-mono text-xs">
                  <span
                    className={
                      event.status === "success" ? "text-success" : event.status === "error" ? "text-danger" : "text-muted"
                    }
                  >
                    {event.status === "success" ? "done" : event.status === "error" ? "failed" : "..."}
                  </span>
                  <span className="text-ink">{event.label}</span>
                </li>
              ))}
            </ul>
          )}
        </Field>

        <Field label="Status">
          <Badge tone={isComplete ? "success" : "accent"}>{isComplete ? "Completed" : "In progress"}</Badge>
        </Field>
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-xs font-medium text-muted">{label}</h3>
      {children}
    </div>
  );
}

function FieldRow({ field, entry }: { field: WorkflowField; entry?: { value: string; confidence: number } }) {
  const isCollected = Boolean(entry);
  return (
    <li className="flex items-baseline justify-between gap-3 text-sm">
      <span className={isCollected ? "text-ink" : "text-muted"}>
        <span className="mr-1.5 font-mono text-xs">{isCollected ? "✓" : "○"}</span>
        {field.label}
        {field.required && !isCollected && <span className="ml-1 text-xs text-urgent">required</span>}
      </span>
      {entry && <span className="truncate font-mono text-xs text-muted">{entry.value}</span>}
    </li>
  );
}
