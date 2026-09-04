import { NextRequest, NextResponse } from "next/server";
import { createWorkflowSchema } from "@/lib/validations/workflow";
import { createWorkflow } from "@/lib/services/workflows";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = createWorkflowSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_workflow", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const { workflowId } = await createWorkflow(parsed.data);
    return NextResponse.json({ workflowId }, { status: 201 });
  } catch (err) {
    // NOTE: createWorkflow performs multiple sequential inserts without a DB
    // transaction (see README trade-offs) — a failure partway through can
    // leave an orphaned workflow row. Logged here rather than silently
    // swallowed so it's visible in server logs during review/demo.
    console.error("createWorkflow failed partway through:", err);
    return NextResponse.json({ error: "workflow_creation_failed" }, { status: 500 });
  }
}
