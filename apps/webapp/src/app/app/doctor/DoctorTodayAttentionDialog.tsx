"use client";

import { Check, CornerDownLeft, SendHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/doctor/primitives/dialog";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Textarea } from "@/shared/ui/doctor/primitives/textarea";
import { proactiveInsightKindLabelRu } from "@/modules/doctor-proactive-insights/computeProactiveInsights";
import { doctorInlineLinkClass, doctorSectionItemClass } from "@/shared/ui/doctor/doctorVisual";
import { ProgramItemDiscussionMessageBody } from "@/app/app/patient/treatment/ProgramItemDiscussionMessageBody";
import { cn } from "@/lib/utils";
import { sendDoctorProgramDiscussionReply } from "@/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/doctorProgramDiscussionReply";
import type { TodayPendingProgramTestItem } from "./mapPendingProgramTestsForToday";
import type { TodayProactiveInsightItem } from "./mapProactiveInsightsForToday";
import { markDoctorProgramDiscussionRead } from "./doctorProgramDiscussionMarkRead";
import {
  groupExerciseCommentAttentionByPatient,
  type TodayExerciseCommentAttentionItem,
} from "./loadDoctorExerciseCommentAttention";
import type { TodayIntakeItem, TodayUnreadConversationItem } from "./loadDoctorTodayDashboard";

export type DoctorTodayAttentionKind =
  | "intake"
  | "messages"
  | "pendingTests"
  | "proactive"
  | "exerciseComments";

const TITLES: Record<DoctorTodayAttentionKind, string> = {
  intake: "Онлайн-заявки",
  messages: "Сообщения",
  pendingTests: "Тесты к проверке",
  proactive: "Сигналы пациентов",
  exerciseComments: "Новые комментарии по упражнениям",
};

const EMPTY_MESSAGES: Record<DoctorTodayAttentionKind, string> = {
  intake: "Новых заявок нет",
  messages: "Непрочитанных сообщений нет",
  pendingTests: "Нет тестов, ожидающих оценки",
  proactive: "Нет сигналов по самочувствию и активности программы",
  exerciseComments: "Нет новых комментариев по упражнениям",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: DoctorTodayAttentionKind | null;
  newIntakeRequests: TodayIntakeItem[];
  unreadConversations: TodayUnreadConversationItem[];
  unreadTotal: number;
  pendingProgramTests: TodayPendingProgramTestItem[];
  pendingProgramTestsTotal: number;
  pendingProgramTestsTruncated: boolean;
  proactiveInsights: TodayProactiveInsightItem[];
  proactiveInsightsTotal: number;
  proactiveInsightsTruncated: boolean;
  exerciseCommentAttentionItems: TodayExerciseCommentAttentionItem[];
  exerciseCommentAttentionTotal: number;
  exerciseCommentAttentionTruncated: boolean;
  onExerciseCommentResolved: (stageItemId: string) => void;
};

function ExerciseCommentAttentionRow(props: {
  item: TodayExerciseCommentAttentionItem;
  onResolved: (stageItemId: string) => void;
}) {
  const { item, onResolved } = props;
  const [activeReply, setActiveReply] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [touchActionVisible, setTouchActionVisible] = useState(false);
  const [touchEnabled, setTouchEnabled] = useState(false);
  const [supportsHover, setSupportsHover] = useState(true);
  const touchDragRef = useRef<{
    startX: number;
    startY: number;
    acted: boolean;
  } | null>(null);
  const ignoreTapRef = useRef(false);

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

  const openReplyComposer = () => {
    setActiveReply(true);
    setReplyDraft("");
    setActionError(null);
    setTouchActionVisible(false);
  };

  const markRead = async () => {
    if (replySending) return;
    setReplySending(true);
    setActionError(null);
    try {
      const result = await markDoctorProgramDiscussionRead({
        instanceId: item.instanceId,
        stageItemId: item.stageItemId,
      });
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      onResolved(item.stageItemId);
    } finally {
      setReplySending(false);
    }
  };

  const submitReply = async () => {
    if (replySending) return;
    const text = replyDraft.trim();
    if (!text) {
      setActionError("Введите ответ");
      return;
    }
    setReplySending(true);
    setActionError(null);
    try {
      const result = await sendDoctorProgramDiscussionReply({
        instanceId: item.instanceId,
        stageItemId: item.stageItemId,
        text,
      });
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      onResolved(item.stageItemId);
    } finally {
      setReplySending(false);
    }
  };

  const actionVisible = touchEnabled && !supportsHover ? touchActionVisible : false;

  return (
    <li
      className={cn("group/row relative flex flex-col gap-1", doctorSectionItemClass)}
      onClick={() => {
        if (!touchEnabled || supportsHover) return;
        if (ignoreTapRef.current) {
          ignoreTapRef.current = false;
          return;
        }
        setTouchActionVisible((prev) => !prev);
      }}
    >
      <p className="text-xs text-muted-foreground">{item.stageItemTitle}</p>
      <p className="text-[11px] text-muted-foreground">{item.latestMessageAtLabel}</p>
      <div
        className="max-w-[min(100%,30rem)] rounded-md border border-border bg-muted/20 px-3 py-2 text-sm"
        onTouchStart={
          touchEnabled
            ? (event) => {
                const touch = event.touches[0];
                if (!touch) return;
                touchDragRef.current = {
                  startX: touch.clientX,
                  startY: touch.clientY,
                  acted: false,
                };
              }
            : undefined
        }
        onTouchMove={
          touchEnabled
            ? (event) => {
                const state = touchDragRef.current;
                const touch = event.touches[0];
                if (!state || !touch || state.acted) return;
                const dx = touch.clientX - state.startX;
                const dy = touch.clientY - state.startY;
                if (Math.abs(dy) > 28) return;
                if (dx <= -48) {
                  state.acted = true;
                  ignoreTapRef.current = true;
                  openReplyComposer();
                } else if (dx >= 48) {
                  state.acted = true;
                  ignoreTapRef.current = true;
                  void markRead();
                }
              }
            : undefined
        }
        onTouchEnd={
          touchEnabled
            ? () => {
                touchDragRef.current = null;
              }
            : undefined
        }
        onTouchCancel={
          touchEnabled
            ? () => {
                touchDragRef.current = null;
              }
            : undefined
        }
      >
        <ProgramItemDiscussionMessageBody message={item.latestMessage} mine={false} />
      </div>

      <div
        className={cn(
          "absolute right-2 bottom-2 flex items-center gap-1 transition-opacity",
          touchEnabled && !supportsHover
            ? actionVisible
              ? "opacity-100"
              : "pointer-events-none opacity-0"
            : "pointer-events-none opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100",
        )}
      >
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-8 rounded-full border-border/70 bg-background/95 shadow-sm"
          aria-label="Ответить"
          disabled={replySending}
          onClick={(event) => {
            event.stopPropagation();
            openReplyComposer();
          }}
        >
          <CornerDownLeft className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-8 rounded-full border-border/70 bg-background/95 shadow-sm"
          aria-label="Отметить прочитанным"
          disabled={replySending}
          onClick={(event) => {
            event.stopPropagation();
            void markRead();
          }}
        >
          <Check className="size-4" />
        </Button>
      </div>

      {activeReply ? (
        <div className="w-full max-w-[min(100%,34rem)]">
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
              onClick={() => void submitReply()}
            >
              <SendHorizontal className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-1 flex items-center justify-between gap-2">
        <Link href={item.href} className={doctorInlineLinkClass}>
          Открыть комментарии в программе
        </Link>
        {actionError ? <p className="text-xs text-destructive">{actionError}</p> : null}
      </div>
    </li>
  );
}

export function DoctorTodayAttentionDialog({
  open,
  onOpenChange,
  kind,
  newIntakeRequests,
  unreadConversations,
  unreadTotal,
  pendingProgramTests,
  pendingProgramTestsTotal,
  pendingProgramTestsTruncated,
  proactiveInsights,
  proactiveInsightsTotal,
  proactiveInsightsTruncated,
  exerciseCommentAttentionItems,
  exerciseCommentAttentionTotal,
  exerciseCommentAttentionTruncated,
  onExerciseCommentResolved,
}: Props) {
  const title = kind ? TITLES[kind] : "";
  const exerciseCommentsByPatient = useMemo(
    () => groupExerciseCommentAttentionByPatient(exerciseCommentAttentionItems),
    [exerciseCommentAttentionItems],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto pr-1">
          {kind === "intake" ? (
            <>
              {newIntakeRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">{EMPTY_MESSAGES.intake}</p>
              ) : (
                <ul className="m-0 list-none space-y-2 p-0">
                  {newIntakeRequests.map((r) => (
                    <li key={r.id} className={doctorSectionItemClass}>
                      <p className="font-medium text-foreground">{r.patientName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Тел.: {r.patientPhone}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.typeLabel} · {r.createdAtLabel}
                      </p>
                      {r.summaryPreview ? (
                        <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-muted-foreground">
                          {r.summaryPreview}
                        </p>
                      ) : null}
                      <p className="mt-2">
                        <Link href={r.href} className={doctorInlineLinkClass}>
                          Открыть заявку
                        </Link>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3">
                <Link href="/app/doctor/online-intake" className={`${doctorInlineLinkClass} text-sm`}>
                  Открыть все заявки
                </Link>
              </p>
            </>
          ) : null}

          {kind === "messages" ? (
            <>
              {unreadTotal > 0 ? (
                <p className="mb-2 text-xs text-muted-foreground">Всего непрочитанных: {unreadTotal}</p>
              ) : null}
              {unreadConversations.length === 0 ? (
                <p className="text-sm text-muted-foreground">{EMPTY_MESSAGES.messages}</p>
              ) : (
                <ul className="m-0 list-none space-y-2 p-0">
                  {unreadConversations.map((c) => (
                    <li key={c.conversationId} className={doctorSectionItemClass}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-medium text-foreground">{c.displayName}</p>
                        <span className="tabular-nums rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium">
                          {c.unreadFromUserCount}
                        </span>
                      </div>
                      {c.phoneNormalized ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">Тел.: {c.phoneNormalized}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">{c.lastMessageAtLabel}</p>
                      {c.lastMessagePreview ? (
                        <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-muted-foreground">
                          {c.lastMessagePreview}
                        </p>
                      ) : null}
                      <p className="mt-2">
                        <Link href={c.href} className={doctorInlineLinkClass}>
                          Открыть сообщения
                        </Link>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3">
                <Link href="/app/doctor/messages" className={`${doctorInlineLinkClass} text-sm`}>
                  Открыть все сообщения
                </Link>
              </p>
            </>
          ) : null}

          {kind === "pendingTests" ? (
            <>
              {pendingProgramTestsTotal > 0 ? (
                <p className="mb-2 text-xs text-muted-foreground">
                  Попыток без оценки: {pendingProgramTestsTotal}
                </p>
              ) : null}
              {pendingProgramTests.length === 0 ? (
                <p className="text-sm text-muted-foreground">{EMPTY_MESSAGES.pendingTests}</p>
              ) : (
                <ul className="m-0 list-none space-y-2 p-0">
                  {pendingProgramTests.map((item) => (
                    <li key={item.attemptId} className={doctorSectionItemClass}>
                      <p className="font-medium text-foreground">{item.patientDisplayName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.instanceTitle} · {item.stageTitle}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.submittedAtLabel} · без оценки: {item.pendingCount}
                      </p>
                      <p className="mt-2">
                        <Link href={item.href} className={doctorInlineLinkClass}>
                          Оценить
                        </Link>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {pendingProgramTestsTruncated ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Показаны первые {pendingProgramTests.length} из {pendingProgramTestsTotal}
                </p>
              ) : null}
            </>
          ) : null}

          {kind === "proactive" ? (
            <>
              {proactiveInsightsTotal > 0 ? (
                <p className="mb-2 text-xs text-muted-foreground">На сопровождении: {proactiveInsightsTotal}</p>
              ) : null}
              {proactiveInsights.length === 0 ? (
                <p className="text-sm text-muted-foreground">{EMPTY_MESSAGES.proactive}</p>
              ) : (
                <ul className="m-0 list-none space-y-2 p-0">
                  {proactiveInsights.map((item) => (
                    <li key={`${item.kind}-${item.patientUserId}`} className={doctorSectionItemClass}>
                      <p className="font-medium text-foreground">{item.patientDisplayName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {proactiveInsightKindLabelRu(item.kind)} · {item.summary}
                      </p>
                      <p className="mt-2">
                        <Link href={item.href} className={doctorInlineLinkClass}>
                          Открыть карточку
                        </Link>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {proactiveInsightsTruncated ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Показаны первые {proactiveInsights.length} из {proactiveInsightsTotal}
                </p>
              ) : null}
            </>
          ) : null}

          {kind === "exerciseComments" ? (
            <>
              {exerciseCommentAttentionTotal > 0 ? (
                <p className="mb-2 text-xs text-muted-foreground">
                  Новых комментариев: {exerciseCommentAttentionTotal}
                </p>
              ) : null}
              {exerciseCommentAttentionItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">{EMPTY_MESSAGES.exerciseComments}</p>
              ) : (
                <div className="space-y-3">
                  {exerciseCommentsByPatient.map((group) => (
                    <section key={group.patientUserId} className="space-y-2">
                      <h3 className="text-sm font-semibold text-foreground">{group.patientDisplayName}</h3>
                      <ul className="m-0 list-none space-y-2 p-0">
                        {group.items.map((item) => (
                          <ExerciseCommentAttentionRow
                            key={item.stageItemId}
                            item={item}
                            onResolved={onExerciseCommentResolved}
                          />
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
              {exerciseCommentAttentionTruncated ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Показаны первые {exerciseCommentAttentionItems.length} из {exerciseCommentAttentionTotal}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
