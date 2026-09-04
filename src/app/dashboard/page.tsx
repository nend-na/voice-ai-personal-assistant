import { getDashboardMetrics, listConversationsForDashboard } from "@/lib/services/conversations";
import { MetricCard } from "@/components/dashboard/metric-card";
import { ConversationsTable } from "@/components/dashboard/conversations-table";

// Server component: fetches directly from the service layer at request time.
// No client-side fetch/loading spinner needed for this read-only view — the
// page itself is the loading boundary (Next.js shows the nearest loading.tsx
// while this resolves, none is defined here since local Supabase reads are
// fast enough that a spinner would just flash).
export default async function DashboardPage() {
  const [metrics, conversations] = await Promise.all([getDashboardMetrics(), listConversationsForDashboard()]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <h1 className="text-lg font-semibold text-ink">Dashboard</h1>
      <p className="mt-1 text-sm text-muted">Missed calls handled automatically, across every connected business.</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Missed calls handled" value={metrics.missedCallsHandled} />
        <MetricCard label="Conversations completed" value={metrics.conversationsCompleted} />
        <MetricCard label="Urgent requests" value={metrics.urgentRequests} tone="urgent" />
        <MetricCard label="Active follow-ups" value={metrics.activeFollowUps} />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-ink">Recent conversations</h2>
      <ConversationsTable rows={conversations} />
    </div>
  );
}
