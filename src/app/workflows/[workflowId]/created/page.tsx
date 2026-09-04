import Link from "next/link";
import { notFound } from "next/navigation";
import { loadWorkflow } from "@/lib/services/workflows";
import { Button } from "@/components/ui/button";

export default async function WorkflowCreatedPage({ params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = await params;
  const workflow = await loadWorkflow(workflowId);
  if (!workflow) notFound();

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
      <h1 className="text-lg font-semibold text-ink">Workflow saved</h1>
      <p className="mt-2 text-sm text-muted">
        &quot;{workflow.name}&quot; is ready to test. It&apos;s saved as a draft — nothing goes live until you activate it.
      </p>

      <div className="mt-8 flex justify-center gap-3">
        <Link href="/simulator">
          <Button>Test it in the simulator</Button>
        </Link>
        <Link href="/dashboard">
          <Button variant="secondary">Back to dashboard</Button>
        </Link>
      </div>
    </div>
  );
}