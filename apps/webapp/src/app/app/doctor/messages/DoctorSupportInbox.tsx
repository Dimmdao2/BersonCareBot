"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { DoctorChatPanel } from "@/modules/messaging/components/DoctorChatPanel";
import { doctorPageStackClass, doctorSectionTitleClass } from "@/shared/ui/doctor/doctorVisual";

/** Интервал поллинга списка диалогов — ~1/сек. */
const POLL_INTERVAL_MS = 1_000;

type ConvRow = {
  conversationId: string;
  displayName: string;
  phoneNormalized: string | null;
  lastMessageAt: string;
  lastMessageText: string | null;
  lastSenderRole: string | null;
  unreadFromUserCount: number;
  hasUnreadFromUser: boolean;
};

type ConversationApiRow = {
  conversationId: string;
  displayName: string;
  phoneNormalized: string | null;
  lastMessageAt: string;
  lastMessageText: string | null;
  lastSenderRole: string | null;
  unreadFromUserCount?: number;
  hasUnreadFromUser?: boolean;
};

function formatConversationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mapConvRows(conversations: ConversationApiRow[]): ConvRow[] {
  return conversations.map((c) => ({
    conversationId: c.conversationId,
    displayName: c.displayName,
    phoneNormalized: c.phoneNormalized,
    lastMessageAt: c.lastMessageAt,
    lastMessageText: c.lastMessageText,
    lastSenderRole: c.lastSenderRole,
    unreadFromUserCount: c.unreadFromUserCount ?? 0,
    hasUnreadFromUser: c.hasUnreadFromUser ?? (c.unreadFromUserCount ?? 0) > 0,
  }));
}

/** Хэш-сигнатура для обнаружения реального изменения при поллинге. */
function convSignature(rows: ConvRow[]): string {
  return rows
    .map((r) => `${r.conversationId}:${r.lastMessageAt}:${r.unreadFromUserCount}`)
    .join("|");
}

export type DoctorSupportInboxProps = {
  /**
   * Признак активного таба. Когда false — поллинг останавливается.
   * По умолчанию true (для использования вне шелла коммуникаций).
   */
  active?: boolean;
};

export function DoctorSupportInbox({ active = true }: DoctorSupportInboxProps) {
  const [list, setList] = useState<ConvRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Сигнатура последнего отрисованного состояния списка — для skip при поллинге без изменений. */
  const sigRef = useRef<string>("");

  const loadList = useCallback(async () => {
    setError(null);
    try {
      const url = new URL("/api/doctor/messages/conversations", window.location.origin);
      if (unreadOnly) url.searchParams.set("unread", "1");
      const res = await fetch(url.toString());
      const data = (await res.json()) as {
        ok?: boolean;
        conversations?: ConversationApiRow[];
      };
      if (!res.ok || !data.ok || !data.conversations) {
        setError("Не удалось загрузить диалоги");
        setList([]);
        sigRef.current = "";
        return;
      }
      const rows = mapConvRows(data.conversations);
      sigRef.current = convSignature(rows);
      setList(rows);
    } catch {
      setError("Ошибка сети при загрузке диалогов");
      setList([]);
      sigRef.current = "";
    }
  }, [unreadOnly]);

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

  // Умный поллинг: только активный таб + видимое окно; setState только при реальном изменении.
  useEffect(() => {
    if (!active) return;

    const pollOnce = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const url = new URL("/api/doctor/messages/conversations", window.location.origin);
        if (unreadOnly) url.searchParams.set("unread", "1");
        const res = await fetch(url.toString());
        const data = (await res.json()) as {
          ok?: boolean;
          conversations?: ConversationApiRow[];
        };
        if (!res.ok || !data.ok || !data.conversations) return;
        const rows = mapConvRows(data.conversations);
        const sig = convSignature(rows);
        if (sig === sigRef.current) return;
        sigRef.current = sig;
        setList(rows);
      } catch {
        // silently skip poll errors — не сбрасываем отображённый список
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") void pollOnce();
    };

    const timerId = setInterval(() => {
      void pollOnce();
    }, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(timerId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [active, unreadOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  return (
    <section id="doctor-support-inbox" className={doctorPageStackClass}>
      <h2 className={doctorSectionTitleClass}>Поддержка (чат)</h2>
      <div className="flex flex-wrap gap-2" aria-label="Фильтр диалогов">
        <Button type="button" size="sm" variant={!unreadOnly ? "default" : "outline"} onClick={() => setUnreadOnly(false)}>
          Все
        </Button>
        <Button type="button" size="sm" variant={unreadOnly ? "default" : "outline"} onClick={() => setUnreadOnly(true)}>
          Непрочитанные
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="grid gap-4 md:grid-cols-[minmax(0,220px)_1fr]">
        <ul className="space-y-1 border border-border/60 rounded-lg p-2 max-h-[60vh] overflow-y-auto">
          {list.length === 0 ? (
            <li className="text-sm text-muted-foreground px-2 py-2">
              {unreadOnly ? "Нет непрочитанных диалогов" : "Нет открытых диалогов"}
            </li>
          ) : (
            list.map((c) => (
              <li key={c.conversationId}>
                <Button
                  type="button"
                  variant="ghost"
                  className={
                    selectedId === c.conversationId
                      ? "h-auto w-full flex-col items-stretch gap-0.5 rounded-md px-2 py-2 text-left text-sm font-normal"
                      : "h-auto w-full flex-col items-stretch gap-0.5 rounded-md px-2 py-2 text-left text-sm font-normal hover:bg-muted/60"
                  }
                  onClick={() => {
                    setSelectedId(c.conversationId);
                  }}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="truncate font-medium">{c.displayName || "Без имени"}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">{formatConversationTime(c.lastMessageAt)}</span>
                      {c.unreadFromUserCount > 0 ? (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                          {c.unreadFromUserCount}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="block w-full truncate text-xs text-muted-foreground">
                    {c.phoneNormalized ? `Телефон: ${c.phoneNormalized}` : "Телефон не указан"}
                  </span>
                  <span className="block w-full text-xs text-muted-foreground">
                    {c.hasUnreadFromUser ? "Пациент · " : c.lastSenderRole === "user" ? "Пациент · " : ""}
                    {(c.lastMessageText ?? "").slice(0, 80)}
                    {(c.lastMessageText?.length ?? 0) > 80 ? "…" : ""}
                  </span>
                  <span className="block w-full text-[11px] text-muted-foreground/90">
                    {c.phoneNormalized ? `Телефон: ${c.phoneNormalized}` : "Телефон не указан"} ·{" "}
                    {new Date(c.lastMessageAt).toLocaleString("ru-RU", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </Button>
              </li>
            ))
          )}
        </ul>
        <div>
          {!selectedId ? (
            <p className="text-muted-foreground text-sm">Выберите диалог слева</p>
          ) : (
            <DoctorChatPanel
              key={selectedId}
              conversationId={selectedId}
              onReadStateChanged={loadList}
              onSent={loadList}
            />
          )}
        </div>
      </div>
    </section>
  );
}
