"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatView } from "@/modules/messaging/components/ChatView";
import { useMessagePolling } from "@/modules/messaging/hooks/useMessagePolling";
import type { SerializedSupportMessage } from "@/modules/messaging/serializeSupportMessage";
import { PatientShimmerPanel } from "@/shared/ui/patientVisual";

export function PatientMessagesClient() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SerializedSupportMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBootstrap = useCallback(async () => {
    const res = await fetch("/api/patient/messages");
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      conversationId?: string;
      messages?: SerializedSupportMessage[];
    };
    if (!res.ok || !data.ok || !data.conversationId) {
      setError(data.error ?? "Ошибка загрузки");
      return;
    }
    setConversationId(data.conversationId);
    setMessages(data.messages ?? []);
    await fetch("/api/patient/messages/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: data.conversationId }),
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await loadBootstrap();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadBootstrap]);

  const lastCreatedAt = messages.length ? messages[messages.length - 1]!.createdAt : null;

  const poll = useCallback(async () => {
    if (!conversationId || !lastCreatedAt) return;
    const u = new URL("/api/patient/messages", window.location.origin);
    u.searchParams.set("conversationId", conversationId);
    u.searchParams.set("since", lastCreatedAt);
    const res = await fetch(u.toString());
    const data = (await res.json()) as { ok?: boolean; messages?: SerializedSupportMessage[] };
    if (!res.ok || !data.ok) return;
    const incoming = data.messages ?? [];
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id));
      const merged = [...prev];
      for (const m of incoming) {
        if (!ids.has(m.id)) merged.push(m);
      }
      merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return merged;
    });
    await fetch("/api/patient/messages/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId }),
    });
  }, [conversationId, lastCreatedAt]);

  useMessagePolling(poll, Boolean(conversationId && lastCreatedAt), 18000);

  const send = async () => {
    const t = draft.trim();
    if (!t || !conversationId || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/patient/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t, conversationId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Не отправлено");
        return;
      }
      setDraft("");
      const res2 = await fetch(
        `/api/patient/messages?conversationId=${encodeURIComponent(conversationId)}`
      );
      const j = (await res2.json()) as { messages?: SerializedSupportMessage[] };
      if (res2.ok && j.messages) setMessages(j.messages);
    } catch {
      setError("Ошибка сети");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="py-6" aria-busy="true" aria-label="Загрузка">
        <PatientShimmerPanel />
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <ChatView
        variant="patient"
        messages={messages}
        emptyText="Напишите сообщение поддержке — ответ появится здесь."
        composer={
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <Textarea
              className="min-h-[88px] resize-y text-sm"
              placeholder="Ваше сообщение…"
              value={draft}
              maxLength={4000}
              onChange={(e) => setDraft(e.target.value)}
              disabled={sending}
              aria-label="Текст сообщения"
            />
            <Button type="button" onClick={() => void send()} disabled={sending || !draft.trim()}>
              {sending ? "Отправка…" : "Отправить"}
            </Button>
          </div>
        }
      />
    </section>
  );
}
