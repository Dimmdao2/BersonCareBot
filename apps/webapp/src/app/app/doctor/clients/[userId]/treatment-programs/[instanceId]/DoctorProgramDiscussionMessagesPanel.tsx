"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
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
}) {
  const { messages, loading, loadingOlder, error, nextCursor, onLoadOlder, itemLabelById } = props;
  const sortedMessages = useMemo(() => [...messages].sort(compareMessages), [messages]);
  const showItemLabels = itemLabelById != null && itemLabelById.size > 0;

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
            return (
              <div key={m.id} className={cn("flex flex-col gap-1", fromPatient ? "items-start" : "items-end")}>
                {itemLabel ? (
                  <p className="text-xs font-medium text-muted-foreground">{itemLabel}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">{fromPatient ? "Пациент" : "Специалист"}</p>
                <div
                  className={cn(
                    "max-w-[min(100%,22rem)] rounded-md border px-3 py-2 text-sm shadow-sm",
                    fromPatient ? "border-border bg-muted/20" : "border-primary/20 bg-primary/5",
                  )}
                >
                  <ProgramItemDiscussionMessageBody message={m} mine={false} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatChatRelativeDateLabelRu(m.createdAt, new Date())} ·{" "}
                  {formatChatMessageTimeRu(m.createdAt)}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
