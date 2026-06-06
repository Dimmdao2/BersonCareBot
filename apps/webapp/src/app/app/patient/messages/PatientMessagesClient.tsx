"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/shared/ui/patient/primitives/button";
import { Textarea } from "@/shared/ui/patient/primitives/textarea";
import { ChatView } from "@/modules/messaging/components/ChatView";
import { useMessagePolling } from "@/modules/messaging/hooks/useMessagePolling";
import { notifyPatientSupportUnreadCountChanged } from "@/modules/messaging/hooks/useSupportUnreadPolling";
import type { SerializedSupportMessage } from "@/modules/messaging/serializeSupportMessage";
import { cn } from "@/lib/utils";
import { PatientShimmerPanel, patientCardClass, patientChatComposerTextareaClass, patientInnerPageStackClass, patientMutedTextClass, patientPrimaryActionClass } from "@/shared/ui/patient/patientVisual";

export function PatientMessagesClient() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SerializedSupportMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composerExpanded, setComposerExpanded] = useState(false);

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
    const readRes = await fetch("/api/patient/messages/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: data.conversationId }),
    });
    if (readRes.ok) notifyPatientSupportUnreadCountChanged();
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
    const readRes = await fetch("/api/patient/messages/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId }),
    });
    if (readRes.ok) notifyPatientSupportUnreadCountChanged();
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
      setComposerExpanded(false);
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
      <div className="flex min-h-0 flex-1 flex-col justify-center py-6" aria-busy="true" aria-label="Загрузка">
        <PatientShimmerPanel />
      </div>
    );
  }

  return (
    <section className={cn(patientCardClass, "flex min-h-0 flex-1 flex-col gap-3 overflow-hidden")}>
      {error ?
        <p className={cn(patientMutedTextClass, "shrink-0 font-medium text-[var(--patient-color-danger)]")}>
          {error}
        </p>
      : null}
      <ChatView
        variant="patient"
        relativeFooters
        stickyComposer
        messages={messages}
        emptyText="Напишите сообщение поддержке — ответ появится здесь."
        className="min-h-0 flex-1"
        composer={
          <div
            className={cn(
              "shrink-0 border-t border-[var(--patient-border)] bg-[var(--patient-card-bg)] pt-3 md:pt-4",
              patientInnerPageStackClass,
            )}
          >
            <Textarea
              rows={2}
              className={cn(
                patientChatComposerTextareaClass,
                "transition-[min-height] duration-200 ease-out",
                composerExpanded || draft.trim().length > 0 ? "min-h-[112px]" : "min-h-[56px]",
              )}
              placeholder="Ваше сообщение…"
              value={draft}
              maxLength={4000}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => setComposerExpanded(true)}
              onBlur={() => {
                if (!draft.trim()) setComposerExpanded(false);
              }}
              disabled={sending}
              aria-label="Текст сообщения"
            />
            <Button
              type="button"
              className={cn(patientPrimaryActionClass, "disabled:opacity-55")}
              onClick={() => void send()}
              disabled={sending || !draft.trim()}
            >
              {sending ? "Отправка…" : "Отправить"}
            </Button>
          </div>
        }
      />
    </section>
  );
}
