import { notFound } from "next/navigation";
import { getConversationDetail } from "@/lib/services/conversations";
import { Badge } from "@/components/ui/badge";
import { FollowUpActions } from "@/components/conversations/followup-actions";

const ACTION_STATUS_TONE = { success: "success", failed: "danger", pending: "muted" } as const;

export default async function ConversationDetailPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const detail = await getConversationDetail(conversationId);
  if (!detail) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">{detail.customerName ?? "Unknown customer"}</h1>
          <p className="font-mono text-sm text-muted">{detail.customerPhone ?? "No phone on file"}</p>
          <p className="mt-1 text-sm text-muted">
            {detail.businessName} · {detail.workflowName}
            {detail.intentLabel && <> · {detail.intentLabel}</>}
          </p>
        </div>
        <div className="flex gap-2">
          {detail.priority === "urgent" && <Badge tone="urgent">Urgent</Badge>}
          <Badge tone={detail.status === "completed" ? "success" : "accent"}>{detail.status.replace("_", " ")}</Badge>
        </div>
      </div>

      {detail.summary && (
        <section className="mt-6 border border-hairline bg-surface p-4">
          <h2 className="text-xs font-medium text-muted">Summary</h2>
          <p className="mt-1.5 text-sm text-ink">{detail.summary}</p>
        </section>
      )}

      <section className="mt-4 border border-hairline bg-surface p-4">
        <h2 className="text-xs font-medium text-muted">Collected information</h2>
        {detail.collected.length === 0 ? (
          <p className="mt-1.5 text-sm text-muted">No structured data was captured for this conversation.</p>
        ) : (
          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {detail.collected.map((c) => (
              <div key={c.fieldName} className="flex justify-between border-b border-hairline pb-1.5 text-sm">
                <dt className="text-muted">{c.label}</dt>
                <dd className="text-ink">{c.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="mt-4 border border-hairline bg-surface p-4">
        <h2 className="text-xs font-medium text-muted">Actions performed</h2>
        {detail.actions.length === 0 ? (
          <p className="mt-1.5 text-sm text-muted">No actions have run yet — this conversation may still be in progress.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {detail.actions.map((a, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="text-ink">{a.actionType.replace(/_/g, " ")}</span>
                <div className="flex items-center gap-2">
                  {a.errorMessage && <span className="text-xs text-muted">{a.errorMessage}</span>}
                  <Badge tone={ACTION_STATUS_TONE[a.status as keyof typeof ACTION_STATUS_TONE] ?? "muted"}>{a.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail.followUp && (
        <section className="mt-4 border border-hairline bg-surface p-4">
          <h2 className="text-xs font-medium text-muted">Follow-up</h2>
          <p className="mt-1.5 text-sm text-ink">
            Currently: <span className="font-medium">{detail.followUp.status}</span>
          </p>
          <div className="mt-3">
            <FollowUpActions conversationId={detail.id} currentStatus={detail.followUp.status} />
          </div>
        </section>
      )}

      <section className="mt-4 border border-hairline bg-surface p-4">
        <h2 className="mb-3 text-xs font-medium text-muted">Transcript</h2>
        <div className="space-y-2">
          {detail.messages.map((m, i) => (
            <div key={i} className="text-sm">
              <span className="mr-2 font-mono text-xs text-muted">
                {m.role === "tool" ? `tool:${m.toolName}` : m.role}
              </span>
              <span className={m.role === "customer" ? "text-ink" : "text-muted"}>{m.content}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}