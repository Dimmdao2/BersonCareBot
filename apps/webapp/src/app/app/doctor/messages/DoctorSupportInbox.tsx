"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { DoctorChatPanel } from "@/modules/messaging/components/DoctorChatPanel";
import { DoctorEmptyState } from "@/shared/ui/doctor/DoctorEmptyState";
import { CatalogSplitLayout } from "@/shared/ui/doctor/catalog/CatalogSplitLayout";
import {
  DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE,
} from "@/shared/ui/doctor/doctorWorkspaceLayout";

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
  onSupport: boolean;
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
  onSupport?: boolean;
};

function formatConversationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  const time = date.toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return time;
  const dayMonth = date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit" });
  return `${dayMonth} · ${time}`;
}

function getSenderPrefix(conv: ConvRow): string {
  if (conv.lastSenderRole === "admin") return "Вы";
  const firstName = (conv.displayName.split(" ")[0] ?? "").trim();
  return firstName || "Пациент";
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
    onSupport: c.onSupport ?? false,
  }));
}

function convSignature(rows: ConvRow[]): string {
  return rows
    .map(
      (r) =>
        `${r.conversationId}:${r.lastMessageAt}:${r.unreadFromUserCount}:${r.onSupport ? "1" : "0"}`,
    )
    .join("|");
}

export type DoctorSupportInboxProps = {
  active?: boolean;
};

type FilterMode = "all" | "unread" | "onSupport";

export function DoctorSupportInbox({ active = true }: DoctorSupportInboxProps) {
  const [allList, setAllList] = useState<ConvRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sigRef = useRef<string>("");

  const fetchList = useCallback(async (): Promise<ConvRow[] | null> => {
    try {
      const url = new URL("/api/doctor/messages/conversations", window.location.origin);
      const res = await fetch(url.toString());
      const data = (await res.json()) as {
        ok?: boolean;
        conversations?: ConversationApiRow[];
      };
      if (!res.ok || !data.ok || !data.conversations) return null;
      return mapConvRows(data.conversations);
    } catch {
      return null;
    }
  }, []);

  const loadList = useCallback(async () => {
    setError(null);
    const rows = await fetchList();
    if (rows === null) {
      setError("Не удалось загрузить диалоги");
      setAllList([]);
      sigRef.current = "";
    } else {
      sigRef.current = convSignature(rows);
      setAllList(rows);
    }
  }, [fetchList]);

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
    if (!active) return;

    const pollOnce = async () => {
      const rows = await fetchList();
      if (rows === null) return;
      const sig = convSignature(rows);
      if (sig === sigRef.current) return;
      sigRef.current = sig;
      setAllList(rows);
    };

    let timerId: ReturnType<typeof setInterval> | null = null;

    const startInterval = () => {
      if (timerId !== null) return;
      timerId = setInterval(() => void pollOnce(), POLL_INTERVAL_MS);
    };

    const stopInterval = () => {
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void pollOnce();
        startInterval();
      } else {
        stopInterval();
      }
    };

    if (document.visibilityState === "visible") startInterval();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stopInterval();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [active, fetchList]);

  const unreadCount = allList.filter((c) => c.unreadFromUserCount > 0).length;
  const onSupportCount = allList.filter((c) => c.onSupport).length;

  const filteredByChip =
    filter === "unread"
      ? allList.filter((c) => c.unreadFromUserCount > 0)
      : filter === "onSupport"
        ? allList.filter((c) => c.onSupport)
        : allList;

  const filteredList = query.trim()
    ? filteredByChip.filter((c) => c.displayName.toLowerCase().includes(query.toLowerCase()))
    : filteredByChip;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        Загрузка…
      </div>
    );
  }

  const leftPane = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
      {/* Header: search bar, then filter chips below */}
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-border bg-muted/20 px-3 py-2">
        <Input
          type="search"
          placeholder="Поиск по имени пациента"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 w-full"
          aria-label="Поиск по имени пациента"
        />
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFilter(filter === "unread" ? "all" : "unread")}
            className={cn(
              "shrink-0 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              filter === "unread"
                ? "bg-primary/15 text-primary"
                : "border border-border text-muted-foreground hover:bg-muted/40",
            )}
            aria-pressed={filter === "unread"}
          >
            Непрочитанные · {unreadCount}
          </button>
          <button
            type="button"
            onClick={() => setFilter(filter === "onSupport" ? "all" : "onSupport")}
            className={cn(
              "shrink-0 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              filter === "onSupport"
                ? "bg-primary/15 text-primary"
                : "border border-border text-muted-foreground hover:bg-muted/40",
            )}
            aria-pressed={filter === "onSupport"}
          >
            ★ На сопровождении · {onSupportCount}
          </button>
        </div>
      </div>

      {error && (
        <p className="border-b border-border px-3 py-2 text-xs text-destructive">{error}</p>
      )}

      {/* Conversation rows */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {filteredList.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">
            {query.trim()
              ? "Ничего не найдено"
              : filter === "unread"
                ? "Нет непрочитанных диалогов"
                : filter === "onSupport"
                  ? "Нет диалогов на сопровождении"
                  : "Нет открытых диалогов"}
          </div>
        ) : (
          filteredList.map((c) => (
            <button
              key={c.conversationId}
              type="button"
              onClick={() => setSelectedId(c.conversationId)}
              className={cn(
                "flex w-full cursor-pointer gap-2 border-b border-border px-3 py-2.5 text-left transition-colors",
                selectedId === c.conversationId
                  ? "bg-primary/15"
                  : "hover:bg-muted/40",
              )}
            >
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold">
                    {c.displayName || "Без имени"}
                    {c.onSupport && (
                      <span className="ml-1.5 text-[10px] font-semibold text-primary">★</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatConversationTime(c.lastMessageAt)}
                  </span>
                </div>
                {c.lastMessageText && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/80">{getSenderPrefix(c)}:</span>{" "}
                    {c.lastMessageText}
                  </p>
                )}
              </div>
              {c.unreadFromUserCount > 0 && (
                <span className="self-center rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                  {c.unreadFromUserCount}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );

  const selectedConv = selectedId ? (allList.find((c) => c.conversationId === selectedId) ?? null) : null;

  const rightPane = (
    <div className="flex min-h-[300px] flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
      {!selectedId ? (
        <DoctorEmptyState
          size="sm"
          className="flex-1 items-center justify-center px-6 text-center"
        >
          <span className="font-semibold text-foreground">Выберите чат слева</span>
          <span>Когда диалог выбран — здесь появляется тред переписки с полем ответа</span>
        </DoctorEmptyState>
      ) : (
        <>
          {/* Thread header: patient name + close button */}
          <div className="shrink-0 flex items-center gap-2 border-b border-border px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {selectedConv?.displayName ?? "—"}
            </span>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label="Закрыть тред"
              className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>
          <DoctorChatPanel
            key={selectedId}
            conversationId={selectedId}
            className="flex-1 min-h-0"
            onReadStateChanged={loadList}
            onSent={loadList}
          />
        </>
      )}
    </div>
  );

  return (
    <div
      id="doctor-support-inbox"
      className={cn(
        "min-h-[400px]",
        DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE,
      )}
    >
      <CatalogSplitLayout
        left={leftPane}
        right={rightPane}
        mobileView={selectedId ? "detail" : "list"}
        mobileBackSlot={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedId(null)}
            className="mb-2"
          >
            ← К списку
          </Button>
        }
        className="lg:grid-cols-[0.8fr_1.6fr] h-full"
      />
    </div>
  );
}
