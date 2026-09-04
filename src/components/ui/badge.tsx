import { clsx } from "clsx";

type BadgeTone = "urgent" | "success" | "muted" | "accent" | "danger";

const TONE_CLASSES: Record<BadgeTone, string> = {
  urgent: "bg-urgent-subtle text-urgent",
  success: "bg-success-subtle text-success",
  muted: "bg-hairline/60 text-muted",
  accent: "bg-accent-subtle text-accent",
  danger: "bg-danger-subtle text-danger",
};

export function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={clsx("inline-flex items-center rounded px-2 py-0.5 text-xs font-medium", TONE_CLASSES[tone])}>
      {children}
    </span>
  );
}
