"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { ChatBubbleOutgoingMeta } from "@/shared/ui/chat/ChatBubbleOutgoingMeta";
import { patientBodyTextClass, patientChatMetaLineClass, patientMutedTextClass } from "@/shared/ui/patient/patientVisual";
import { chatMessageDeliveryStatus } from "../chatMessageDeliveryStatus";
import {
  formatChatMessageTimeRu,
  formatChatRelativeDateLabelRu,
  groupMessagesByDay,
} from "../messageFormatting";
import type { SerializedSupportMessage } from "../serializeSupportMessage";

type Variant = "patient" | "doctor";

function isAlignedRight(senderRole: string, variant: Variant): boolean {
  if (variant === "patient") return senderRole === "user";
  return senderRole === "admin";
}

const bubbleRadiusPatientChatClass =
  "rounded-[var(--patient-card-radius-mobile)] md:rounded-[var(--patient-card-radius-desktop)]";

type ChatViewProps = {
  variant: Variant;
  messages: SerializedSupportMessage[];
  emptyText?: string;
  composer: ReactNode;
  /**
   * Пациент: подпись дата и время под пузырём (сегодня / вчера / 5 июня / … год),
   * без блоковых разделителей по дням.
   */
  relativeFooters?: boolean;
  className?: string;
};

/** Каркас чата: группировка по дням, пузырьки, скролл вниз. */
export function ChatView({
  variant,
  messages,
  emptyText,
  composer,
  relativeFooters = false,
  className,
}: ChatViewProps) {
  const patientRelative = variant === "patient" && relativeFooters;
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const grouped = groupMessagesByDay(messages);
  const flatSorted = useMemo(
    () => [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [messages],
  );
  const scrollClasses = cn(
    "min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-4 pb-4 pt-1 md:pb-5",
    variant === "doctor" && "px-3",
  );

  const patientBubbleMine = cn(
    "max-w-full px-3 py-2 text-sm shadow-sm md:max-w-[min(100%,24rem)]",
    bubbleRadiusPatientChatClass,
    "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]",
  );

  const patientBubbleOther = cn(
    "max-w-full px-3 py-2 text-sm shadow-sm md:max-w-[min(100%,24rem)]",
    bubbleRadiusPatientChatClass,
    "border border-[var(--patient-surface-info-border)]/80 bg-[var(--patient-color-primary-soft)] text-[var(--patient-text-primary)]",
  );

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      <div className={cn(scrollClasses, messages.length === 0 && "flex items-center justify-center")}>
        {messages.length === 0 ?
          <p
            className={cn(patientRelative ? cn("text-center", patientMutedTextClass) : "text-center text-sm text-muted-foreground")}
          >
            {emptyText ?? "Пока нет сообщений."}
          </p>
        : relativeFooters ?
          flatSorted.map((m) => {
            const mine = isAlignedRight(m.senderRole, variant);
            const deliveryStatus = mine
              ? chatMessageDeliveryStatus({ createdAt: m.createdAt, readAt: m.readAt })
              : null;
            return (
              <div key={m.id} className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
                <div className={cn("flex max-w-[min(100%,22rem)]", mine ? "justify-end" : "justify-start")}>
                  <div className={mine ? patientBubbleMine : patientBubbleOther}>
                    <p
                      className={cn(
                        "whitespace-pre-wrap break-words",
                        mine ? undefined : patientRelative ? patientBodyTextClass : undefined,
                      )}
                    >
                      {m.text}
                    </p>
                    {mine && deliveryStatus ?
                      <ChatBubbleOutgoingMeta
                        timeLabel={formatChatMessageTimeRu(m.createdAt)}
                        deliveryStatus={deliveryStatus}
                      />
                    : null}
                  </div>
                </div>
                {!mine ?
                  <p
                    className={cn(
                      "max-w-[min(100%,22rem)] md:max-w-[min(100%,24rem)]",
                      patientRelative ? patientChatMetaLineClass : "text-[11px] leading-snug tabular-nums text-muted-foreground",
                      "text-start",
                    )}
                  >
                    {formatChatRelativeDateLabelRu(m.createdAt, new Date())} ·{" "}
                    {formatChatMessageTimeRu(m.createdAt)}
                  </p>
                : null}
              </div>
            );
          })
        : grouped.map((g) => (
            <div key={g.dayKey}>
              <p className="mb-2 text-center text-xs capitalize text-muted-foreground">{g.dayLabel}</p>
              <div className={variant === "doctor" ? "space-y-3" : "space-y-2"}>
                {g.items.map((m) => {
                  const mine = isAlignedRight(m.senderRole, variant);
                  const deliveryStatus = mine
                    ? chatMessageDeliveryStatus({ createdAt: m.createdAt, readAt: m.readAt })
                    : null;
                  return (
                    <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                          mine
                            ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                            : "bg-muted text-foreground",
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.text}</p>
                        {mine && deliveryStatus ?
                          <ChatBubbleOutgoingMeta
                            timeLabel={formatChatMessageTimeRu(m.createdAt)}
                            deliveryStatus={deliveryStatus}
                          />
                        : (
                          <p className="mt-1 text-[10px] tabular-nums opacity-70">
                            {formatChatMessageTimeRu(m.createdAt)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        <div ref={bottomRef} />
      </div>
      <div className={cn("mt-auto shrink-0", variant === "doctor" && "px-3")}>{composer}</div>
    </div>
  );
}
