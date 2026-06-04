"use client";

import { CornerDownLeft, SendHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Textarea } from "@/shared/ui/doctor/primitives/textarea";
import type { ProgramItemDiscussionMessage } from "@/modules/program-item-discussion/types";
import { cn } from "@/lib/utils";
import { formatChatMessageTimeRu, formatChatRelativeDateLabelRu } from "@/modules/messaging/messageFormatting";
import { ProgramItemDiscussionMessageBody } from "@/app/app/patient/treatment/ProgramItemDiscussionMessageBody";

function compareMessages(a: ProgramItemDiscussionMessage, b: ProgramItemDiscussionMessage): number {
  const byDate = a.createdAt.localeCompare(b.createdAt);
  if (byDate !== 0) return byDate;
  return a.id.localeCompare(b.id);
}

export function DoctorProgramDiscussionMessagesPanel(props: {
  messages: ProgramItemDiscussionMessage[];
  loading: boolean;
  loadingOlder: boolean;
  error: string | null;
  nextCursor: string | null;
  onLoadOlder: () => void;
  itemLabelById?: Map<string, string>;
  onSelectItemFilter?: (stageItemId: string) => void;
  onSendReply?: (stageItemId: string, text: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const {
    messages,
    loading,
    loadingOlder,
    error,
    nextCursor,
    onLoadOlder,
    itemLabelById,
    onSelectItemFilter,
    onSendReply,
  } = props;
  const sortedMessages = useMemo(() => [...messages].sort(compareMessages), [messages]);
  const showItemLabels = itemLabelById != null && itemLabelById.size > 0;
  const [activeReplyMessageId, setActiveReplyMessageId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [touchReplyTargetId, setTouchReplyTargetId] = useState<string | null>(null);
  const [touchEnabled, setTouchEnabled] = useState(false);
  const [supportsHover, setSupportsHover] = useState(true);
  const touchDragRef = useRef<{
    messageId: string;
    startX: number;
    startY: number;
    openedBySwipe: boolean;
  } | null>(null);
  const ignoreTapMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const hoverMedia = window.matchMedia("(hover: hover)");
    const sync = () => {
      setSupportsHover(hoverMedia.matches);
      setTouchEnabled((typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0) > 0);
    };
    sync();
    if (typeof hoverMedia.addEventListener === "function") {
      hoverMedia.addEventListener("change", sync);
      return () => hoverMedia.removeEventListener("change", sync);
    }
    if (typeof hoverMedia.addListener === "function") {
      hoverMedia.addListener(sync);
      return () => hoverMedia.removeListener(sync);
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (!activeReplyMessageId) return;
    if (sortedMessages.some((message) => message.id === activeReplyMessageId)) return;
    setActiveReplyMessageId(null);
    setReplyDraft("");
    setReplyError(null);
  }, [activeReplyMessageId, sortedMessages]);

  const openReplyComposer = (messageId: string) => {
    setActiveReplyMessageId(messageId);
    setReplyDraft("");
    setReplyError(null);
    setTouchReplyTargetId(null);
  };

  const closeReplyComposer = () => {
    setActiveReplyMessageId(null);
    setReplyDraft("");
    setReplyError(null);
  };

  const submitReply = async (message: ProgramItemDiscussionMessage) => {
    if (!onSendReply || replySending) return;
    const text = replyDraft.trim();
    if (!text) {
      setReplyError("Введите ответ");
      return;
    }
    setReplySending(true);
    setReplyError(null);
    try {
      const result = await onSendReply(message.instanceStageItemId, text);
      if (!result.ok) {
        setReplyError(result.error ?? "Не удалось отправить ответ");
        return;
      }
      closeReplyComposer();
    } finally {
      setReplySending(false);
    }
  };

  return (
    <div className="flex h-[min(75vh,34rem)] min-h-[20rem] flex-col gap-2">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {nextCursor ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={loading || loadingOlder}
          onClick={onLoadOlder}
        >
          {loadingOlder ? "Загрузка..." : "Показать предыдущие"}
        </Button>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto space-y-4 pb-2" data-testid="doctor-program-discussion-messages">
        {sortedMessages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            {loading ? "Загрузка..." : "Пока нет сообщений."}
          </p>
        ) : (
          sortedMessages.map((m) => {
            const fromPatient = m.senderRole === "patient";
            const itemLabel = showItemLabels ? itemLabelById.get(m.instanceStageItemId) : null;
            const authorLabel = fromPatient ? "Пациент" : "Врач";
            const replyAffordanceVisible =
              fromPatient && onSendReply
                ? activeReplyMessageId === m.id || touchReplyTargetId === m.id
                : false;
            return (
              <div
                key={m.id}
                className={cn(
                  "group/row relative flex w-full flex-col gap-1",
                  fromPatient ? "items-start pr-12" : "items-end",
                )}
                onClick={() => {
                  if (!touchEnabled || supportsHover || !fromPatient || !onSendReply) return;
                  if (ignoreTapMessageIdRef.current === m.id) {
                    ignoreTapMessageIdRef.current = null;
                    return;
                  }
                  setTouchReplyTargetId((prev) => (prev === m.id ? null : m.id));
                }}
              >
                {itemLabel ? (
                  onSelectItemFilter ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectItemFilter(m.instanceStageItemId);
                      }}
                    >
                      {itemLabel}
                    </button>
                  ) : (
                    <p className="text-xs font-medium text-muted-foreground">{itemLabel}</p>
                  )
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {authorLabel} · {formatChatRelativeDateLabelRu(m.createdAt, new Date())} · {formatChatMessageTimeRu(m.createdAt)}
                </p>
                <div
                  className={cn(
                    "max-w-[min(100%,22rem)] rounded-md border px-3 py-2 text-sm shadow-sm",
                    fromPatient ? "border-border bg-muted/20" : "border-primary/20 bg-primary/5",
                  )}
                  onTouchStart={
                    fromPatient && onSendReply && touchEnabled
                      ? (event) => {
                          const touch = event.touches[0];
                          if (!touch) return;
                          touchDragRef.current = {
                            messageId: m.id,
                            startX: touch.clientX,
                            startY: touch.clientY,
                            openedBySwipe: false,
                          };
                        }
                      : undefined
                  }
                  onTouchMove={
                    fromPatient && onSendReply && touchEnabled
                      ? (event) => {
                          const state = touchDragRef.current;
                          const touch = event.touches[0];
                          if (!state || !touch || state.messageId !== m.id || state.openedBySwipe) return;
                          const dx = touch.clientX - state.startX;
                          const dy = touch.clientY - state.startY;
                          if (dx <= -48 && Math.abs(dy) <= 28) {
                            state.openedBySwipe = true;
                            ignoreTapMessageIdRef.current = m.id;
                            openReplyComposer(m.id);
                          }
                        }
                      : undefined
                  }
                  onTouchEnd={
                    fromPatient && onSendReply && touchEnabled
                      ? () => {
                          touchDragRef.current = null;
                        }
                      : undefined
                  }
                  onTouchCancel={
                    fromPatient && onSendReply && touchEnabled
                      ? () => {
                          touchDragRef.current = null;
                        }
                      : undefined
                  }
                >
                  <ProgramItemDiscussionMessageBody message={m} mine={false} />
                </div>
                {fromPatient && onSendReply ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className={cn(
                      "absolute right-0 bottom-1 size-8 rounded-full border-border/70 bg-background/95 shadow-sm transition-opacity",
                      touchEnabled && !supportsHover
                        ? replyAffordanceVisible
                          ? "opacity-100"
                          : "pointer-events-none opacity-0"
                        : "pointer-events-none opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100",
                    )}
                    aria-label="Ответить"
                    onClick={(event) => {
                      event.stopPropagation();
                      openReplyComposer(m.id);
                    }}
                  >
                    <CornerDownLeft className="size-4" />
                  </Button>
                ) : null}
                {fromPatient && onSendReply && activeReplyMessageId === m.id ? (
                  <div className="w-full max-w-[min(100%,26rem)]">
                    <div className="relative mt-1 rounded-md border border-border bg-background p-2 pb-10">
                      <Textarea
                        value={replyDraft}
                        onChange={(event) => setReplyDraft(event.target.value)}
                        rows={3}
                        maxLength={4000}
                        placeholder="Введите ответ пациенту"
                        className="min-h-[84px] resize-y"
                        disabled={replySending}
                      />
                      <Button
                        type="button"
                        size="icon"
                        className="absolute right-3 bottom-3 size-8 rounded-full"
                        disabled={replySending || !replyDraft.trim()}
                        aria-label="Отправить ответ"
                        onClick={() => void submitReply(m)}
                      >
                        <SendHorizontal className="size-4" />
                      </Button>
                    </div>
                    {replyError ? <p className="mt-1 text-xs text-destructive">{replyError}</p> : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
