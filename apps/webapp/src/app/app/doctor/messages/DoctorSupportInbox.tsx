"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChatView } from "@/modules/messaging/components/ChatView";
import { useMessagePolling } from "@/modules/messaging/hooks/useMessagePolling";
import type { SerializedSupportMessage } from "@/modules/messaging/serializeSupportMessage";

type ConvRow = {
  conversationId: string;
  displayName: string;
  phoneNormalized: string | null;
  lastMessageAt: string;
  lastMessageText: string | null;
  lastSenderRole: string | null;
};

export function DoctorSupportInbox() {
  const [list, setList] = useState<ConvRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SerializedSupportMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const res = await fetch("/api/doctor/messages/conversations");
    const data = (await res.json()) as {
      ok?: boolean;
      conversations?: {
        conversationId: string;
        displayName: string;
        phoneNormalized: string | null;
        lastMessageAt: string;
        lastMessageText: string | null;
        lastSenderRole: string | null;
      }[];
    };
    if (!res.ok || !data.ok || !data.conversations) {
      setError("Не удалось загрузить диалоги");
      return;
    }
    setList(
      data.conversations.map((c) => ({
        conversationId: c.conversationId,
        displayName: c.displayName,
        phoneNormalized: c.phoneNormalized,
        lastMessageAt: c.lastMessageAt,
        lastMessageText: c.lastMessageText,
        lastSenderRole: c.lastSenderRole,
      }))
    );
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    const res = await fetch(`/api/doctor/messages/${encodeURIComponent(conversationId)}`);
    const data = (await res.json()) as { ok?: boolean; messages?: SerializedSupportMessage[] };
    if (!res.ok || !data.ok) {
      setError("Не удалось загрузить сообщения");
      return;
    }
    setMessages(data.messages ?? []);
    await fetch(`/api/doctor/messages/${encodeURIComponent(conversationId)}/read`, {
      method: "POST",
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await loadList();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) return;
    void loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  const lastCreatedAt = messages.length ? messages[messages.length - 1]!.createdAt : null;

  const poll = useCallback(async () => {
    if (!selectedId || !lastCreatedAt) return;
    const u = new URL(`/api/doctor/messages/${encodeURIComponent(selectedId)}`, window.location.origin);
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
  }, [selectedId, lastCreatedAt]);

  useMessagePolling(poll, Boolean(selectedId && lastCreatedAt), 18000);

  const send = async () => {
    const t = draft.trim();
    if (!t || !selectedId || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctor/messages/${encodeURIComponent(selectedId)}`, {
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
      await loadMessages(selectedId);
      await loadList();
    } catch {
      setError("Ошибка сети");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  return (
    <section id="doctor-support-inbox" className="panel stack gap-4">
      <h2 className="text-lg font-semibold">Поддержка (чат)</h2>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="grid gap-4 md:grid-cols-[minmax(0,220px)_1fr]">
        <ul className="space-y-1 border border-border/60 rounded-lg p-2 max-h-[60vh] overflow-y-auto">
          {list.length === 0 ? (
            <li className="text-sm text-muted-foreground px-2 py-2">Нет открытых диалогов</li>
          ) : (
            list.map((c) => (
              <li key={c.conversationId}>
                <button
                  type="button"
                  className={cn(
                    "w-full rounded-md px-2 py-2 text-left text-sm transition-colors",
                    selectedId === c.conversationId
                      ? "bg-muted font-medium"
                      : "hover:bg-muted/60"
                  )}
                  onClick={() => {
                    setSelectedId(c.conversationId);
                    setMessages([]);
                  }}
                >
                  <span className="block truncate">{c.displayName || "Без имени"}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.lastSenderRole === "user" ? "Пациент · " : ""}
                    {(c.lastMessageText ?? "").slice(0, 80)}
                    {(c.lastMessageText?.length ?? 0) > 80 ? "…" : ""}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        <div>
          {!selectedId ? (
            <p className="text-muted-foreground text-sm">Выберите диалог слева</p>
          ) : (
            <ChatView
              variant="doctor"
              messages={messages}
              emptyText="Нет сообщений в этом диалоге."
              composer={
                <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
                  <textarea
                    className="auth-input min-h-[88px] w-full resize-y rounded-lg px-3 py-2 text-sm"
                    placeholder="Ответ…"
                    value={draft}
                    maxLength={4000}
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={sending}
                    aria-label="Текст ответа"
                  />
                  <Button type="button" onClick={() => void send()} disabled={sending || !draft.trim()}>
                    {sending ? "Отправка…" : "Отправить"}
                  </Button>
                </div>
              }
            />
          )}
        </div>
      </div>
    </section>
  );
}
