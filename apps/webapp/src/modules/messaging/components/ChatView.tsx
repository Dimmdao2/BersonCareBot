"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { groupMessagesByDay } from "../messageFormatting";
import type { SerializedSupportMessage } from "../serializeSupportMessage";

type Variant = "patient" | "doctor";

function isAlignedRight(senderRole: string, variant: Variant): boolean {
  if (variant === "patient") return senderRole === "user";
  return senderRole === "admin";
}

type ChatViewProps = {
  variant: Variant;
  messages: SerializedSupportMessage[];
  emptyText?: string;
  composer: ReactNode;
};

/** Каркас чата: группировка по дням, пузырьки, скролл вниз. */
export function ChatView({ variant, messages, emptyText, composer }: ChatViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const groups = groupMessagesByDay(messages);

  return (
    <div className="flex min-h-[50vh] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 ? (
          <p className="text-muted-foreground text-center text-muted-foreground">{emptyText ?? "Пока нет сообщений."}</p>
        ) : (
          groups.map((g) => (
            <div key={g.dayKey}>
              <p className="mb-2 text-center text-xs capitalize text-muted-foreground">{g.dayLabel}</p>
              <div className="space-y-2">
                {g.items.map((m) => {
                  const mine = isAlignedRight(m.senderRole, variant);
                  return (
                    <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                          mine
                            ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                            : "bg-muted text-foreground"
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.text}</p>
                        <p className="mt-1 text-[10px] opacity-70">
                          {new Date(m.createdAt).toLocaleTimeString("ru-RU", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      {composer}
    </div>
  );
}
