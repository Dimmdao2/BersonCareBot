"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { ProgramItemDiscussionMessage } from "@/modules/program-item-discussion/types";
import { cn } from "@/lib/utils";
import {
  patientChatComposerTextareaClass,
  patientChatMetaLineClass,
  patientMutedTextClass,
  patientPrimaryActionClass,
} from "@/shared/ui/patientVisual";
import { formatChatMessageTimeRu, formatChatRelativeDateLabelRu } from "@/modules/messaging/messageFormatting";
import { ProgramItemDiscussionMediaPicker } from "@/app/app/patient/treatment/ProgramItemDiscussionMediaPicker";
import { ProgramItemDiscussionMessageBody } from "@/app/app/patient/treatment/ProgramItemDiscussionMessageBody";

type DiscussionPageResponse = {
  ok?: boolean;
  error?: string;
  messages?: ProgramItemDiscussionMessage[];
  pageInfo?: {
    nextCursor?: string | null;
  };
};

function compareMessages(a: ProgramItemDiscussionMessage, b: ProgramItemDiscussionMessage): number {
  const byDate = a.createdAt.localeCompare(b.createdAt);
  if (byDate !== 0) return byDate;
  return a.id.localeCompare(b.id);
}

export function ProgramItemDiscussionDialog(props: {
  instanceId: string;
  itemId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRead?: () => void | Promise<void>;
  mediaSubmissionEnabled?: boolean;
}) {
  const { instanceId, itemId, open, onOpenChange, onRead, mediaSubmissionEnabled = false } = props;
  const [messages, setMessages] = useState<ProgramItemDiscussionMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const basePath = useMemo(
    () =>
      `/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(itemId)}/discussion`,
    [instanceId, itemId],
  );

  const markRead = useCallback(async () => {
    const res = await fetch(`${basePath}/read`, { method: "POST" });
    if (!res.ok) return false;
    await onRead?.();
    return true;
  }, [basePath, onRead]);

  const loadPage = useCallback(
    async (cursor: string | null, appendOlder: boolean) => {
      const url = new URL(basePath, window.location.origin);
      url.searchParams.set("direction", "backward");
      url.searchParams.set("limit", "50");
      if (cursor) url.searchParams.set("cursor", cursor);
      const res = await fetch(url.toString());
      const data = (await res.json().catch(() => null)) as DiscussionPageResponse | null;
      if (!res.ok || !data?.ok || !Array.isArray(data.messages)) {
        throw new Error(data?.error ?? "Не удалось загрузить комментарии");
      }
      const loaded = data.messages;
      setMessages((prev) => {
        if (!appendOlder) return loaded;
        const map = new Map(prev.map((m) => [m.id, m]));
        for (const msg of loaded) map.set(msg.id, msg);
        return [...map.values()].sort(compareMessages);
      });
      setNextCursor(typeof data.pageInfo?.nextCursor === "string" ? data.pageInfo.nextCursor : null);
    },
    [basePath],
  );

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadPage(null, false);
      await markRead();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось загрузить комментарии";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [loadPage, markRead]);

  useEffect(() => {
    if (!open) return;
    void bootstrap();
  }, [open, bootstrap]);

  const sendText = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(basePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "Не удалось отправить комментарий");
        return;
      }
      setDraft("");
      await bootstrap();
    } catch {
      setError("Ошибка сети");
    } finally {
      setSending(false);
    }
  }, [basePath, bootstrap, draft, sending]);

  const sortedMessages = useMemo(() => [...messages].sort(compareMessages), [messages]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg border border-[var(--patient-border)] shadow-md sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Комментарии</DialogTitle>
        </DialogHeader>

        <div className="flex h-[min(75vh,34rem)] min-h-[20rem] flex-col gap-2">
          {error ?
            <p className={cn(patientMutedTextClass, "text-sm text-[var(--patient-color-danger)]")}>{error}</p>
          : null}
          {nextCursor ?
            <Button
              type="button"
              variant="outline"
              className="self-start"
              disabled={loading || loadingOlder}
              onClick={() => {
                if (!nextCursor) return;
                setLoadingOlder(true);
                void loadPage(nextCursor, true)
                  .catch((e) => {
                    const msg = e instanceof Error ? e.message : "Не удалось загрузить комментарии";
                    setError(msg);
                  })
                  .finally(() => setLoadingOlder(false));
              }}
            >
              {loadingOlder ? "Загрузка..." : "Показать предыдущие"}
            </Button>
          : null}

          <div className="min-h-0 flex-1 overflow-y-auto space-y-4 pb-4 pt-1 md:pb-5">
            {sortedMessages.length === 0 ?
              <p className={cn("text-center", patientMutedTextClass)}>
                {loading ? "Загрузка..." : "Пока нет комментариев."}
              </p>
            : sortedMessages.map((m) => {
                const mine = m.senderRole === "patient";
                return (
                  <div key={m.id} className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
                    <div className={cn("flex max-w-[min(100%,22rem)]", mine ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-full px-3 py-2 text-sm shadow-sm md:max-w-[min(100%,24rem)]",
                          "rounded-[var(--patient-card-radius-mobile)] md:rounded-[var(--patient-card-radius-desktop)]",
                          mine ?
                            "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                          : "border border-[var(--patient-surface-info-border)]/80 bg-[var(--patient-color-primary-soft)] text-[var(--patient-text-primary)]",
                        )}
                      >
                        <ProgramItemDiscussionMessageBody message={m} mine={mine} />
                      </div>
                    </div>
                    <p
                      className={cn(
                        "max-w-[min(100%,22rem)] md:max-w-[min(100%,24rem)]",
                        patientChatMetaLineClass,
                        mine ? "text-end" : "text-start",
                      )}
                    >
                      {formatChatRelativeDateLabelRu(m.createdAt, new Date())} ·{" "}
                      {formatChatMessageTimeRu(m.createdAt)}
                    </p>
                  </div>
                );
              })
            }
          </div>

          <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--patient-border)] pt-3">
            <div className="flex items-end gap-2">
              {mediaSubmissionEnabled ?
                <ProgramItemDiscussionMediaPicker
                  instanceId={instanceId}
                  itemId={itemId}
                  disabled={sending || loading}
                  onUploaded={() => bootstrap()}
                  onError={() => setError("Не удалось загрузить файл")}
                />
              : null}
              <Textarea
                className={cn(patientChatComposerTextareaClass, "min-h-0 flex-1")}
                placeholder="Ваш комментарий..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={4000}
                disabled={sending || loading}
                aria-label="Текст комментария"
              />
            </div>
            <Button
              type="button"
              className={cn(patientPrimaryActionClass, "disabled:opacity-55")}
              onClick={() => void sendText()}
              disabled={sending || loading || draft.trim().length === 0}
            >
              {sending ? "Отправка..." : "Отправить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
