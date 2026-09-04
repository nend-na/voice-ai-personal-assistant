"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Button } from "@/components/ui/button";

export interface SimMessage {
  role: "customer" | "assistant";
  content: string;
}

interface ChatPanelProps {
  messages: SimMessage[];
  onSend: (text: string) => void;
  disabled: boolean;
  isSending: boolean;
}

export function ChatPanel({ messages, onSend, disabled, isSending }: ChatPanelProps) {
  const [draft, setDraft] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || disabled) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
        {messages.length === 0 && (
          <p className="text-sm text-muted">Send a message as the customer to start the simulated call.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={clsx("flex", m.role === "customer" ? "justify-end" : "justify-start")}>
            <div
              className={clsx(
                "max-w-[80%] rounded px-3 py-2 text-sm",
                m.role === "customer" ? "bg-accent text-white" : "border border-hairline bg-surface text-ink"
              )}
            >
              {m.content}
            </div>
          </div>
        ))}
        {isSending && <p className="text-xs text-muted">Assistant is responding…</p>}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-hairline p-3 sm:p-4">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={disabled}
          placeholder={disabled ? "Conversation ended" : "Type what the customer would say…"}
          className="flex-1 rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted disabled:bg-paper"
        />
        <Button type="submit" disabled={disabled || isSending}>
          Send
        </Button>
      </form>
    </div>
  );
}
