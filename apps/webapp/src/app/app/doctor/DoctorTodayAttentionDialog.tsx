'use client';

import { Check, CornerDownLeft, SendHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import { doctorInlineLinkClass } from '@/shared/ui/doctor/doctorVisual';
import {
  DoctorDnaFlatList,
  DoctorDnaFlatListRow,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { DoctorConversationListRow } from '@/modules/messaging/components/DoctorConversationListRow';
import { cn } from '@/lib/utils';
import { sendDoctorProgramDiscussionReply } from '@/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/doctorProgramDiscussionReply';
import type { TodayPendingProgramTestItem } from './mapPendingProgramTestsForToday';
import { markDoctorProgramDiscussionRead } from './doctorProgramDiscussionMarkRead';
import type { TodayExerciseCommentAttentionItem } from './loadDoctorExerciseCommentAttention';
import { ExerciseCommentPreviewListRow } from './comments/ExerciseCommentPreviewItem';
import type { TodayUnreadConversationItem } from './loadDoctorTodayDashboard';

export type DoctorTodayAttentionKind = 'messages' | 'pendingTests' | 'exerciseComments';

const TITLES: Record<DoctorTodayAttentionKind, string> = {
  messages: 'Сообщения',
  pendingTests: 'Тесты к проверке',
  exerciseComments: 'Комментарии',
};

const EMPTY_MESSAGES: Record<DoctorTodayAttentionKind, string> = {
  messages: 'Непрочитанных сообщений нет',
  pendingTests: 'Нет тестов, ожидающих оценки',
  exerciseComments: 'Нет новых комментариев по упражнениям',
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: DoctorTodayAttentionKind | null;
  unreadConversations: TodayUnreadConversationItem[];
  unreadTotal: number;
  pendingProgramTests: TodayPendingProgramTestItem[];
  pendingProgramTestsTotal: number;
  pendingProgramTestsTruncated: boolean;
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
  const [replyDraft, setReplyDraft] = useState('');
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
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const hoverMedia = window.matchMedia('(hover: hover)');
    const sync = () => {
      setSupportsHover(hoverMedia.matches);
      setTouchEnabled((typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0) > 0);
    };
    sync();
    if (typeof hoverMedia.addEventListener === 'function') {
      hoverMedia.addEventListener('change', sync);
      return () => hoverMedia.removeEventListener('change', sync);
    }
    if (typeof hoverMedia.addListener === 'function') {
      hoverMedia.addListener(sync);
      return () => hoverMedia.removeListener(sync);
    }
    return undefined;
  }, []);

  const openReplyComposer = () => {
    setActiveReply(true);
    setReplyDraft('');
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
      setActionError('Введите ответ');
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
    <ExerciseCommentPreviewListRow
      item={item}
      listItemProps={{
        className: 'flex flex-col gap-1',
        onClick: () => {
          if (!touchEnabled || supportsHover) return;
          if (ignoreTapRef.current) {
            ignoreTapRef.current = false;
            return;
          }
          setTouchActionVisible((prev) => !prev);
        },
      }}
      previewProps={{
        className: 'max-w-[min(100%,30rem)]',
        onTouchStart: touchEnabled
          ? (event) => {
              const touch = event.touches[0];
              if (!touch) return;
              touchDragRef.current = {
                startX: touch.clientX,
                startY: touch.clientY,
                acted: false,
              };
            }
          : undefined,
        onTouchMove: touchEnabled
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
          : undefined,
        onTouchEnd: touchEnabled
          ? () => {
              touchDragRef.current = null;
            }
          : undefined,
        onTouchCancel: touchEnabled
          ? () => {
              touchDragRef.current = null;
            }
          : undefined,
      }}
    >
      <div
        className={cn(
          'absolute right-2 bottom-2 flex items-center gap-1 transition-opacity',
          touchEnabled && !supportsHover
            ? actionVisible
              ? 'opacity-100'
              : 'pointer-events-none opacity-0'
            : 'pointer-events-none opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100',
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
    </ExerciseCommentPreviewListRow>
  );
}

export function DoctorTodayAttentionDialog({
  open,
  onOpenChange,
  kind,
  unreadConversations,
  unreadTotal,
  pendingProgramTests,
  pendingProgramTestsTotal,
  pendingProgramTestsTruncated,
  exerciseCommentAttentionItems,
  exerciseCommentAttentionTotal,
  exerciseCommentAttentionTruncated,
  onExerciseCommentResolved,
}: Props) {
  const title = kind ? TITLES[kind] : '';
  return (
    <DoctorModal
      open={open}
      onClose={() => onOpenChange(false)}
      title={title}
      size="lg"
      bodyVariant="list"
    >
      {kind === 'messages' ? (
        <>
          {unreadTotal > 0 ? (
            <p className="px-4 pt-3 pb-2 text-xs text-muted-foreground">
              Всего непрочитанных: {unreadTotal}
            </p>
          ) : null}
          {unreadConversations.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">{EMPTY_MESSAGES.messages}</p>
          ) : (
            <DoctorDnaFlatList>
              {unreadConversations.map((c) => (
                <li key={c.conversationId}>
                  <DoctorConversationListRow
                    conversation={{
                      conversationId: c.conversationId,
                      displayName: c.displayName,
                      phoneNormalized: c.phoneNormalized,
                      lastMessageAt: c.lastMessageAt,
                      lastMessageText: c.lastMessagePreview ?? c.lastMessageText,
                      lastSenderRole: c.lastSenderRole,
                      unreadFromUserCount: c.unreadFromUserCount,
                    }}
                    href={c.href}
                  />
                </li>
              ))}
            </DoctorDnaFlatList>
          )}
          <p className="px-4 pt-3 pb-4">
            <Link href="/app/doctor/messages" className={`${doctorInlineLinkClass} text-sm`}>
              Открыть все сообщения
            </Link>
          </p>
        </>
      ) : null}

      {kind === 'pendingTests' ? (
        <>
          {pendingProgramTestsTotal > 0 ? (
            <p className="px-4 pt-3 pb-2 text-xs text-muted-foreground">
              Попыток без оценки: {pendingProgramTestsTotal}
            </p>
          ) : null}
          {pendingProgramTests.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">{EMPTY_MESSAGES.pendingTests}</p>
          ) : (
            <DoctorDnaFlatList>
              {pendingProgramTests.map((item) => (
                <DoctorDnaFlatListRow key={item.attemptId} className="items-start">
                  <div className="min-w-0 flex-1">
                    <p className={doctorDnaFlatListPrimaryClass}>{item.patientDisplayName}</p>
                    <p className={`${doctorDnaFlatListMetaClass} mt-0.5`}>
                      {item.instanceTitle} · {item.stageTitle}
                    </p>
                    <p className={`${doctorDnaFlatListMetaClass} mt-0.5`}>
                      {item.submittedAtLabel} · без оценки: {item.pendingCount}
                    </p>
                  </div>
                  <Link href={item.href} className={`${doctorInlineLinkClass} shrink-0 text-sm`}>
                    Оценить
                  </Link>
                </DoctorDnaFlatListRow>
              ))}
            </DoctorDnaFlatList>
          )}
          {pendingProgramTestsTruncated ? (
            <p className="px-4 pt-2 pb-4 text-xs text-muted-foreground">
              Показаны первые {pendingProgramTests.length} из {pendingProgramTestsTotal}
            </p>
          ) : null}
        </>
      ) : null}

      {kind === 'exerciseComments' ? (
        <>
          {exerciseCommentAttentionItems.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              {EMPTY_MESSAGES.exerciseComments}
            </p>
          ) : (
            <DoctorDnaFlatList>
              {exerciseCommentAttentionItems.map((item) => (
                <ExerciseCommentAttentionRow
                  key={item.stageItemId}
                  item={item}
                  onResolved={onExerciseCommentResolved}
                />
              ))}
            </DoctorDnaFlatList>
          )}
          {exerciseCommentAttentionTruncated ? (
            <p className="px-4 pt-2 pb-4 text-xs text-muted-foreground">
              Показаны первые {exerciseCommentAttentionItems.length} из{' '}
              {exerciseCommentAttentionTotal}
            </p>
          ) : null}
        </>
      ) : null}
    </DoctorModal>
  );
}
