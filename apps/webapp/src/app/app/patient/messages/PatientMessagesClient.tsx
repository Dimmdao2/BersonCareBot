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

  const poll = useCallback(async () => {
    if (!conversationId) return;
    try {
      const fullRes = await fetch(`/api/patient/messages?conversationId=${encodeURIComponent(conversationId)}`);
      const fullData = (await fullRes.json()) as {
        ok?: boolean;
        messages?: SerializedSupportMessage[];
      };
      if (!fullRes.ok || !fullData.ok || !Array.isArray(fullData.messages)) return;
      setMessages(fullData.messages);
      const readRes = await fetch("/api/patient/messages/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      if (readRes.ok) notifyPatientSupportUnreadCountChanged();
    } catch {
      // Polling is best-effort.
    }
  }, [conversationId]);

  useMessagePolling(poll, Boolean(conversationId), 18000);

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
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: SerializedSupportMessage;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Не отправлено");
        return;
      }
      setDraft("");
      setComposerExpanded(false);
      if (data.message) {
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          if (ids.has(data.message!.id)) return prev;
          const merged = [...prev, data.message!];
          merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          return merged;
        });
      }
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
    <section
      className={cn(
        patientCardClass,
        "flex min-h-0 flex-col gap-3 overflow-hidden",
        "patient-messages-chat-height",
      )}
    >
      {error ?
        <p className={cn(patientMutedTextClass, "shrink-0 font-medium text-[var(--patient-color-danger)]")}>
          {error}
        </p>
      : null}
      <ChatView
        variant="patient"
        relativeFooters
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
