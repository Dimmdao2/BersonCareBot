"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  PlatformSupportConversation,
  PlatformSupportConversationDetail,
} from "@/modules/messaging/platformSupportService";
import { DoctorEmptyState } from "@/shared/ui/doctor/DoctorEmptyState";
import {
  DoctorDnaFlatListSelectionStrip,
  doctorDnaFlatListClass,
  doctorDnaFlatListClickableClass,
  doctorDnaFlatListInsetClass,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
  doctorDnaFlatListSelectedPrimaryClass,
} from "@/shared/ui/doctor/DoctorDnaFlatListRow";
import { CatalogSplitLayout } from "@/shared/ui/doctor/catalog/CatalogSplitLayout";
import { DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE } from "@/shared/ui/doctor/doctorWorkspaceLayout";
import { Button } from "@/shared/ui/doctor/primitives/button";

type ListResponse = {
  ok?: boolean;
  conversations?: PlatformSupportConversation[];
};

type DetailResponse = Partial<PlatformSupportConversationDetail> & {
  ok?: boolean;
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(date);
}

function ticketTitle(conversation: PlatformSupportConversation): string {
  return `Обращение ${conversation.conversationId.slice(0, 8)}`;
}

function senderLabel(senderRole: string): string {
  return senderRole === "user" ? "Пользователь" : "Поддержка";
}

function statusLabel(status: string): string {
  if (status === "closed") return "Закрыто";
  if (status === "open") return "Открыто";
  return status || "—";
}

export function PlatformSupportInbox() {
  const [unansweredOnly, setUnansweredOnly] = useState(false);
  const [conversations, setConversations] = useState<
    PlatformSupportConversation[]
  >([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] =
    useState<PlatformSupportConversationDetail | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/support/conversations?unanswered=${unansweredOnly ? "1" : "0"}&limit=100`,
      );
      const body = (await response.json()) as ListResponse;
      if (!response.ok || !body.ok || !body.conversations) {
        throw new Error("list_failed");
      }
      setConversations(body.conversations);
      if (
        selectedId &&
        !body.conversations.some(
          (conversation) => conversation.conversationId === selectedId,
        )
      ) {
        setSelectedId(null);
        setDetail(null);
      }
    } catch {
      setConversations([]);
      setError("Не удалось загрузить обращения");
    } finally {
      setListLoading(false);
    }
  }, [selectedId, unansweredOnly]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const selectConversation = useCallback(async (conversationId: string) => {
    setSelectedId(conversationId);
    setDetail(null);
    setDetailLoading(true);
    try {
      const response = await fetch(
        `/api/admin/support/conversations/${encodeURIComponent(conversationId)}`,
      );
      const body = (await response.json()) as DetailResponse;
      if (
        !response.ok ||
        !body.ok ||
        !body.conversation ||
        !body.messages
      ) {
        throw new Error("detail_failed");
      }
      setDetail({
        conversation: body.conversation,
        messages: body.messages,
      });
    } catch {
      setError("Не удалось загрузить переписку");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const leftPane = (
    <div
      data-doctor-flat-list-surface
      className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/20 px-3 py-2">
        <Button
          type="button"
          variant={unansweredOnly ? "ghost" : "outline"}
          size="sm"
          aria-pressed={unansweredOnly}
          onClick={() => setUnansweredOnly((value) => !value)}
          className={cn(
            "text-xs",
            unansweredOnly &&
              "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary",
          )}
        >
          Без ответа
        </Button>
        <span className="text-xs text-muted-foreground">
          {listLoading ? "Загрузка…" : `Найдено: ${conversations.length}`}
        </span>
      </div>

      {error ? (
        <p role="alert" className="border-b border-border px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-1 flex-col overflow-y-auto">
        {!listLoading && conversations.length === 0 ? (
          <DoctorEmptyState className="m-auto">
            <MessageCircle className="size-5" aria-hidden />
            <span>
              {unansweredOnly
                ? "Нет обращений без ответа"
                : "Обращений пока нет"}
            </span>
          </DoctorEmptyState>
        ) : (
          <ul
            className={cn(
              doctorDnaFlatListClass,
              doctorDnaFlatListInsetClass,
              "flex flex-col",
            )}
          >
            {conversations.map((conversation) => {
              const selected =
                selectedId === conversation.conversationId;
              const unanswered = conversation.lastSenderRole === "user";
              return (
                <li key={conversation.conversationId}>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      void selectConversation(conversation.conversationId)
                    }
                    className={cn(
                      doctorDnaFlatListRowClass,
                      doctorDnaFlatListClickableClass,
                      "h-auto w-full rounded-none bg-transparent text-left shadow-none",
                    )}
                  >
                    {selected ? (
                      <DoctorDnaFlatListSelectionStrip />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={cn(
                            "truncate",
                            doctorDnaFlatListPrimaryClass,
                            selected &&
                              doctorDnaFlatListSelectedPrimaryClass,
                          )}
                        >
                          {ticketTitle(conversation)}
                        </span>
                        <span
                          className={cn(
                            "shrink-0",
                            doctorDnaFlatListMetaClass,
                          )}
                        >
                          {formatDateTime(conversation.lastMessageAt)}
                        </span>
                      </div>
                      <p className={cn("truncate", doctorDnaFlatListMetaClass)}>
                        {conversation.organizationTitle ??
                          "Без организации"}
                        {conversation.channelCode
                          ? ` · ${conversation.channelCode}`
                          : ""}
                      </p>
                      <p className={cn("mt-0.5 truncate", doctorDnaFlatListMetaClass)}>
                        <span className="font-medium text-foreground/80">
                          {senderLabel(conversation.lastSenderRole)}:
                        </span>{" "}
                        {conversation.lastMessageText}
                      </p>
                    </div>
                    {unanswered ? (
                      <span className="shrink-0 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                        Без ответа
                      </span>
                    ) : null}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );

  const rightPane = (
    <div className="flex min-h-[300px] flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
      {!selectedId ? (
        <DoctorEmptyState className="flex-1 items-center justify-center px-6 text-center">
          <span className="font-semibold text-foreground">
            Выберите обращение слева
          </span>
          <span>Здесь появятся сведения об обращении и переписка</span>
        </DoctorEmptyState>
      ) : detailLoading || !detail ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Загрузка переписки…
        </div>
      ) : (
        <>
          <div className="shrink-0 border-b border-border px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold">
                  {ticketTitle(detail.conversation)}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {detail.conversation.organizationTitle ??
                    "Без организации"}
                  {detail.conversation.channelCode
                    ? ` · ${detail.conversation.channelCode}`
                    : ""}
                </p>
              </div>
              <span className="rounded-full border border-border px-2 py-1 text-xs">
                {statusLabel(detail.conversation.status)}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Открыто</dt>
                <dd>{formatDateTime(detail.conversation.openedAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Закрыто</dt>
                <dd>{formatDateTime(detail.conversation.closedAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Область</dt>
                <dd>{detail.conversation.adminScope || "—"}</dd>
              </div>
              {detail.conversation.closeReason ? (
                <div className="col-span-2 sm:col-span-3">
                  <dt className="text-muted-foreground">
                    Причина закрытия
                  </dt>
                  <dd>{detail.conversation.closeReason}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          <ol
            aria-label="Переписка обращения"
            className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
          >
            {detail.messages.map((message) => {
              const fromUser = message.senderRole === "user";
              return (
                <li
                  key={message.id}
                  className={cn(
                    "flex",
                    fromUser ? "justify-start" : "justify-end",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                      fromUser
                        ? "bg-muted text-foreground"
                        : "bg-primary/10 text-foreground",
                    )}
                  >
                    <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-medium">
                        {senderLabel(message.senderRole)}
                      </span>
                      <time dateTime={message.createdAt}>
                        {formatDateTime(message.createdAt)}
                      </time>
                    </div>
                    <p className="whitespace-pre-wrap break-words">
                      {message.text}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );

  return (
    <CatalogSplitLayout
      left={leftPane}
      right={rightPane}
      mobileView={selectedId ? "detail" : "list"}
      mobileBackSlot={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-2 h-9 px-2"
          onClick={() => {
            setSelectedId(null);
            setDetail(null);
          }}
        >
          ← К списку
        </Button>
      }
      desktopColsClassName="lg:grid-cols-[minmax(0,9fr)_minmax(0,11fr)]"
      className={DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE}
    />
  );
}
