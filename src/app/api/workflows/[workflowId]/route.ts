import { NextRequest, NextResponse } from "next/server";
import { loadWorkflow } from "@/lib/services/workflows";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = await params;
  const workflow = await loadWorkflow(workflowId);
  if (!workflow) {
    return NextResponse.json({ error: "workflow_not_found" }, { status: 404 });
  }
  return NextResponse.json(workflow);
}