"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ChatView } from "@/modules/messaging/components/ChatView";
import { notifyDoctorSupportUnreadCountChanged } from "@/modules/messaging/hooks/useSupportUnreadPolling";
import { useMessagePolling } from "@/modules/messaging/hooks/useMessagePolling";
import type { SerializedSupportMessage } from "@/modules/messaging/serializeSupportMessage";

type DoctorChatPanelProps = {
  conversationId: string;
  initialMessages?: SerializedSupportMessage[];
  className?: string;
  emptyText?: string;
  onReadStateChanged?: () => void | Promise<void>;
  onSent?: () => void | Promise<void>;
};

export function DoctorChatPanel({
  conversationId,
  initialMessages,
  className,
  emptyText = "Нет сообщений в этом диалоге.",
  onReadStateChanged,
  onSent,
}: DoctorChatPanelProps) {
  const [messages, setMessages] = useState<SerializedSupportMessage[]>(initialMessages ?? []);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(!initialMessages);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const markRead = useCallback(async () => {
    try {
      const res = await fetch(`/api/doctor/messages/${encodeURIComponent(conversationId)}/read`, {
        method: "POST",
      });
      if (res.ok) {
        notifyDoctorSupportUnreadCountChanged();
        await onReadStateChanged?.();
      }
    } catch {
      // Read state is best-effort; keep the chat usable if it fails.
    }
  }, [conversationId, onReadStateChanged]);

  const loadMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/doctor/messages/${encodeURIComponent(conversationId)}`);
      const data = (await res.json()) as { ok?: boolean; messages?: SerializedSupportMessage[] };
      if (!res.ok || !data.ok) {
        setError("Не удалось загрузить сообщения");
        return;
      }
      setMessages(data.messages ?? []);
      await markRead();
    } catch {
      setError("Не удалось загрузить сообщения");
    }
  }, [conversationId, markRead]);

  useEffect(() => {
    let cancelled = false;
    setDraft("");
    setError(null);
    setLoading(true);
    (async () => {
      try {
        if (initialMessages) {
          if (!cancelled) setMessages(initialMessages);
          await markRead();
        } else {
          await loadMessages();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, initialMessages, loadMessages, markRead]);

  const lastCreatedAt = messages.length ? messages[messages.length - 1]!.createdAt : null;

  const poll = useCallback(async () => {
    try {
      const u = new URL(`/api/doctor/messages/${encodeURIComponent(conversationId)}`, window.location.origin);
      if (lastCreatedAt) {
        u.searchParams.set("since", lastCreatedAt);
      }
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
      if (incoming.some((m) => m.senderRole === "user")) {
        await markRead();
      }
    } catch {
      // Polling is best-effort; keep current messages and avoid noisy UI flapping.
    }
  }, [conversationId, lastCreatedAt, markRead]);

  useMessagePolling(poll, Boolean(conversationId), 18000);

  const send = async () => {
    const t = draft.trim();
    if (!t || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctor/messages/${encodeURIComponent(conversationId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || !data.ok) {
        setError("Не отправлено");
        return;
      }
      setDraft("");
      await loadMessages();
      await onSent?.();
    } catch {
      setError("Ошибка сети");
    } finally {
      setSending(false);
    }
  };

  const composer = (
    <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
      <Textarea
        className="min-h-[88px] resize-y"
        placeholder="Ответ..."
        value={draft}
        maxLength={4000}
        onChange={(e) => setDraft(e.target.value)}
        disabled={sending}
        aria-label="Текст ответа"
      />
      <Button type="button" onClick={() => void send()} disabled={sending || !draft.trim()}>
        {sending ? "Отправка..." : "Отправить"}
      </Button>
    </div>
  );

  if (loading) {
    return <p className={cn("text-sm text-muted-foreground", className)}>Загрузка сообщений...</p>;
  }

  return (
    <div className={cn("min-w-0", className)}>
      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
      <ChatView variant="doctor" messages={messages} emptyText={emptyText} composer={composer} />
    </div>
  );
}
