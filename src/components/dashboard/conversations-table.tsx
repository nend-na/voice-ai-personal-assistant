import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { ConversationRow } from "@/lib/services/conversations";

const STATUS_TONE: Record<string, "accent" | "success" | "muted" | "danger"> = {
  in_progress: "accent",
  completed: "success",
  abandoned: "muted",
  failed: "danger",
};

export function ConversationsTable({ rows }: { rows: ConversationRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="border border-hairline bg-surface px-4 py-10 text-center">
        <p className="text-sm text-ink">No conversations yet</p>
        <p className="mt-1 text-sm text-muted">Missed-call conversations will show up here once a workflow runs.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-hairline bg-surface">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-xs font-medium text-muted">
            <th className="px-4 py-2.5">Customer</th>
            <th className="px-4 py-2.5">Business</th>
            <th className="px-4 py-2.5">Intent</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5">Priority</th>
            <th className="px-4 py-2.5">Follow-up</th>
            <th className="px-4 py-2.5">When</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-hairline last:border-0 hover:bg-paper">
              <td className="px-4 py-2.5">
                <Link href={`/conversations/${row.id}`} className="text-ink hover:text-accent">
                  {row.customerName ?? "Unknown"}
                  {row.isDemo && <span className="ml-1.5 text-xs text-muted">(demo)</span>}
                </Link>
                <p className="font-mono text-xs text-muted">{row.customerPhone ?? "—"}</p>
              </td>
              <td className="px-4 py-2.5 text-muted">{row.businessName}</td>
              <td className="px-4 py-2.5 text-muted">{row.intentLabel ?? "—"}</td>
              <td className="px-4 py-2.5">
                <Badge tone={STATUS_TONE[row.status] ?? "muted"}>{row.status.replace("_", " ")}</Badge>
              </td>
              <td className="px-4 py-2.5">
                {row.priority === "urgent" ? <Badge tone="urgent">Urgent</Badge> : <span className="text-muted">Normal</span>}
              </td>
              <td className="px-4 py-2.5 text-muted">{row.followUpStatus ?? "—"}</td>
              <td className="px-4 py-2.5 text-muted">{new Date(row.startedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
