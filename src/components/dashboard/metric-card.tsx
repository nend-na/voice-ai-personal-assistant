export function MetricCard({ label, value, tone }: { label: string; value: number; tone?: "urgent" }) {
  return (
    <div className="border border-hairline bg-surface p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold ${tone === "urgent" && value > 0 ? "text-urgent" : "text-ink"}`}>{value}</p>
    </div>
  );
}
