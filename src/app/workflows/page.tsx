import Link from "next/link";
import { listAllWorkflows } from "@/lib/services/workflows";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function WorkflowsPage() {
  const workflows = await listAllWorkflows();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink">Workflows</h1>
        <Link href="/workflows/new">
          <Button>New workflow</Button>
        </Link>
      </div>

      {workflows.length === 0 ? (
        <div className="mt-6 border border-hairline bg-surface px-4 py-10 text-center">
          <p className="text-sm text-ink">No workflows yet</p>
          <p className="mt-1 text-sm text-muted">Create one to start handling missed calls automatically.</p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-hairline border border-hairline bg-surface">
          {workflows.map((w) => (
            <li key={w.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm text-ink">{w.name}</p>
                <p className="text-xs text-muted">{w.businessName}</p>
              </div>
              <Badge tone={w.status === "active" ? "success" : "muted"}>{w.status}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
