"use client";

import { useState } from "react";
import { SetupPanel } from "@/components/simulator/setup-panel";
import { ChatPanel, type SimMessage } from "@/components/simulator/chat-panel";
import { LiveStatePanel } from "@/components/simulator/live-state-panel";
import type { Workflow } from "@/types/workflow";
import type { ToolEvent } from "@/types/conversation";

interface TurnResponse {
  conversationId: string;
  assistantMessage: string;
  isComplete: boolean;
  priority: "normal" | "urgent";
  workflowIntentId: string | null;
  collected: Record<string, { fieldName: string; value: string; confidence: number }>;
  toolEvents: ToolEvent[];
}

export default function SimulatorPage() {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [collected, setCollected] = useState<TurnResponse["collected"]>({});
  const [priority, setPriority] = useState<"normal" | "urgent">("normal");
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [intentId, setIntentId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart(selectedBusinessId: string, workflowId: string) {
    setStarting(true);
    setError(null);
    try {
      const workflowRes = await fetch(`/api/workflows/${workflowId}`);
      if (!workflowRes.ok) throw new Error("workflow_not_found");
      const workflowData: Workflow = await workflowRes.json();
      setWorkflow(workflowData);
      setBusinessId(selectedBusinessId);
      // The first turn both creates the conversation (no conversationId sent)
      // and processes the customer's opening message.
    } catch {
      setError("Couldn't load that workflow. It may have been deleted.");
    } finally {
      setStarting(false);
    }
  }

  async function handleSend(text: string) {
    if (!workflow || !businessId) return;
    setMessages((prev) => [...prev, { role: "customer", content: text }]);
    setIsSending(true);
    setError(null);

    try {
      const res = await fetch("/api/conversations/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId ?? undefined,
          workflowId: workflow.id,
          businessId,
          mode: "simulated",
          language: workflow.language,
          message: text,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "request_failed");
      }

      const data: TurnResponse = await res.json();
      setConversationId(data.conversationId);
      setMessages((prev) => [...prev, { role: "assistant", content: data.assistantMessage }]);
      setCollected(data.collected);
      setPriority(data.priority);
      setToolEvents((prev) => [...prev, ...data.toolEvents]);
      setIsComplete(data.isComplete);
      setIntentId(data.workflowIntentId);
    } catch {
      setError("The assistant is temporarily unavailable. Please try sending that again.");
    } finally {
      setIsSending(false);
    }
  }

  if (!workflow || !businessId) {
    return <SetupPanel onStart={handleStart} starting={starting} />;
  }

  return (
    <div className="flex h-[calc(100vh-57px)] flex-col">
      <div className="border-b border-hairline bg-surface px-4 py-2.5 sm:px-6">
        <p className="text-sm text-ink">
          Simulating <span className="font-medium">{workflow.name}</span>
        </p>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
      <div className="grid flex-1 grid-cols-1 overflow-hidden sm:grid-cols-[1fr_320px]">
        <ChatPanel messages={messages} onSend={handleSend} disabled={isComplete} isSending={isSending} />
        <LiveStatePanel
          workflow={workflow}
          intentId={intentId}
          collected={collected}
          priority={priority}
          toolEvents={toolEvents}
          isComplete={isComplete}
        />
      </div>
    </div>
  );
}
