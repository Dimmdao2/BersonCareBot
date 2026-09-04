'use client';

import { ArrowUp, ChartLine, Pencil, Play, Trash2, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/doctor/primitives/dialog';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import type { ProgramItemDiscussionMessage } from '@/modules/program-item-discussion/types';
import { cn } from '@/lib/utils';
import {
  dayKeyFromIso,
  formatChatMessageTimeRu,
  formatChatRelativeDateLabelRu,
} from '@/modules/messaging/messageFormatting';
import { chatMessageDeliveryStatus } from '@/modules/messaging/chatMessageDeliveryStatus';
import {
  DOCTOR_CHAT_BUBBLE_MAX_WIDTH,
  DoctorChatBubbleMeta,
} from '@/shared/ui/chat/DoctorChatBubbleMeta';
import {
  chatBubbleOwnClass,
  chatBubblePeerClass,
  chatThreadSurfaceClass,
} from '@/shared/ui/chat/chatThreadSurface';
import { MessageComposer } from '@/shared/ui/chat/MessageComposer';
import { ProgramItemDiscussionMessageBody } from '@/app/app/patient/treatment/ProgramItemDiscussionMessageBody';
import type { ExerciseMedia } from '@/modules/lfk-exercises/types';
import { ExerciseListCatalogThumb } from '@/shared/ui/doctor/media/ExerciseListCatalogThumb';
import { DoctorExerciseMediaPlayer } from '@/shared/ui/doctor/media/DoctorExerciseMediaPlayer';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import {
  doctorChatMessageTextClass,
  doctorInteractiveSurfaceButtonClass,
  doctorListPreviewTextClass,
  doctorMetaTextClass,
} from '@/shared/ui/doctor/doctorVisual';

export type DoctorProgramDiscussionAssignment = {
  media: ExerciseMedia | null;
  reps: number | null;
  sets: number | null;
  maxPain: number | null;
  weightKg: number | null;
  note: string | null;
};

function AssignmentToolbar({
  assignment,
  onShowStatistics,
  onEdit,
}: {
  assignment: DoctorProgramDiscussionAssignment;
  onShowStatistics?: () => void;
  onEdit?: () => void;
}) {
  const [videoOpen, setVideoOpen] = useState(false);
  const isPlayableVideo =
    assignment.media?.mediaType === 'video' || assignment.media?.mediaType === 'hosted_video';

  const loadParts: string[] = [];
  if (assignment.reps !== null || assignment.sets !== null) {
    loadParts.push(
      assignment.sets === null
        ? `${assignment.reps ?? '—'} повт.`
        : `${assignment.reps ?? '—'}×${assignment.sets}`,
    );
  }
  if (assignment.weightKg !== null) loadParts.push(`${assignment.weightKg} кг`);
  if (assignment.maxPain !== null) loadParts.push(`Боль ≤ ${assignment.maxPain}`);

  return (
    <div className="relative z-10 flex shrink-0 flex-col bg-card">
      <DoctorModal
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        title="Видео упражнения"
        presentation="fullscreen-media"
      >
        <DoctorExerciseMediaPlayer
          media={assignment.media}
          title="Видео упражнения"
          presentation="fullscreen"
        />
      </DoctorModal>
      {/* Превью, первая строка рекомендаций и действия выровнены по ВЕРХНЕМУ краю блока;
          кнопки живут в первой строке (её высоту и задают), поэтому заметку они не перекрывают. */}
      <div className="flex items-start gap-3 px-4 pt-2.5 pb-[5px]">
        {isPlayableVideo ? (
          <Button
            type="button"
            variant="ghost"
            className={cn(doctorInteractiveSurfaceButtonClass, 'relative shrink-0 rounded-md')}
            onClick={() => setVideoOpen(true)}
            aria-label="Открыть видео упражнения"
            data-testid="assignment-toolbar-preview"
          >
            <ExerciseListCatalogThumb media={assignment.media} className="!size-11 !rounded-md" />
            <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/25">
              <Play className="size-4 fill-white text-white" aria-hidden />
            </span>
          </Button>
        ) : (
          <ExerciseListCatalogThumb media={assignment.media} className="!size-11 !rounded-md" />
        )}
        <div className="relative min-w-0 flex-1" style={{ marginTop: '-4px' }}>
          <div style={{ marginTop: '4px' }}>
            <div style={{ paddingRight: onShowStatistics || onEdit ? '5rem' : undefined }}>
              {loadParts.length > 0 ? (
                <p className="text-sm leading-5 font-medium text-muted-foreground">
                  {loadParts.join(', ')}
                </p>
              ) : (
                <p className={cn(doctorMetaTextClass, 'font-medium')}>Нагрузка не задана</p>
              )}
            </div>
            {assignment.note ? (
              <p className={cn(doctorListPreviewTextClass, 'font-medium text-muted-foreground')}>
                {assignment.note}
              </p>
            ) : null}
          </div>
          {onShowStatistics || onEdit ? (
            <div
              className="absolute right-0 flex shrink-0 items-center gap-1"
              style={{ top: '-5px' }}
            >
              {onShowStatistics ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9 shrink-0 text-foreground"
                  onClick={onShowStatistics}
                  aria-label="Открыть статистику упражнения"
                >
                  <ChartLine className="size-5" aria-hidden />
                </Button>
              ) : null}
              {onEdit ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9 shrink-0 text-foreground"
                  onClick={onEdit}
                  aria-label="Изменить рекомендации"
                >
                  <Pencil className="size-5" aria-hidden />
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

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
  onSendReply?: (stageItemId: string, text: string) => Promise<{ ok: boolean; error?: string }>;
  onDeleteMediaMessage?: (messageId: string) => Promise<{ ok: boolean; error?: string }>;
  peerLastReadAt?: string | null;
  peerLastReadAtByStageItemId?: Record<string, string | null>;
  assignment?: DoctorProgramDiscussionAssignment | null;
  onShowStatistics?: () => void;
  onEditAssignment?: () => void;
  /** Per-item dialog can send directly without first selecting a patient message. */
  composerStageItemId?: string;
}) {
  const {
    messages,
    loading,
    loadingOlder,
    error,
    nextCursor,
    onLoadOlder,
    itemLabelById,
    onSendReply,
    onDeleteMediaMessage,
    peerLastReadAt = null,
    peerLastReadAtByStageItemId,
    assignment = null,
    onShowStatistics,
    onEditAssignment,
    composerStageItemId,
  } = props;
  const sortedMessages = useMemo(() => [...messages].sort(compareMessages), [messages]);
  const showItemLabels = itemLabelById != null && itemLabelById.size > 0;
  const [activeReplyMessageId, setActiveReplyMessageId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [touchEnabled, setTouchEnabled] = useState(false);
  const [supportsHover, setSupportsHover] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ProgramItemDiscussionMessage | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTailMessageIdRef = useRef<string | null>(null);
  const touchDragRef = useRef<{
    messageId: string;
    startX: number;
    startY: number;
    openedBySwipe: boolean;
  } | null>(null);
  const ignoreTapMessageIdRef = useRef<string | null>(null);
  const activeReplyMessage = useMemo(
    () => sortedMessages.find((message) => message.id === activeReplyMessageId) ?? null,
    [activeReplyMessageId, sortedMessages],
  );

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

  useEffect(() => {
    if (!activeReplyMessageId) return;
    if (sortedMessages.some((message) => message.id === activeReplyMessageId)) return;
    setActiveReplyMessageId(null);
    setReplyDraft('');
    setReplyError(null);
  }, [activeReplyMessageId, sortedMessages]);

  useLayoutEffect(() => {
    const scrollContainer = scrollRef.current;
    const tailMessageId = sortedMessages.at(-1)?.id ?? null;
    if (!scrollContainer || tailMessageId === lastTailMessageIdRef.current) return;
    scrollContainer.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior: lastTailMessageIdRef.current ? 'smooth' : 'auto',
    });
    lastTailMessageIdRef.current = tailMessageId;
  }, [sortedMessages]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const styles = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 20;
    const verticalChrome =
      Number.parseFloat(styles.paddingTop) +
      Number.parseFloat(styles.paddingBottom) +
      Number.parseFloat(styles.borderTopWidth) +
      Number.parseFloat(styles.borderBottomWidth);
    const maxHeight = lineHeight * 10 + verticalChrome;
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [replyDraft]);

  const openReplyComposer = (messageId: string) => {
    setActiveReplyMessageId(messageId);
    setReplyDraft('');
    setReplyError(null);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const closeReplyComposer = () => {
    setActiveReplyMessageId(null);
    setReplyDraft('');
    setReplyError(null);
  };

  const confirmDeleteMedia = async () => {
    if (!deleteTarget || !onDeleteMediaMessage || deletePending) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const result = await onDeleteMediaMessage(deleteTarget.id);
      if (!result.ok) {
        setDeleteError(result.error ?? 'Не удалось удалить файл из чата');
        return;
      }
      setDeleteTarget(null);
    } finally {
      setDeletePending(false);
    }
  };

  const submitReply = async (stageItemId: string) => {
    if (!onSendReply || replySending) return;
    const text = replyDraft.trim();
    if (!text) {
      setReplyError('Введите ответ');
      return;
    }
    setReplySending(true);
    setReplyError(null);
    try {
      const result = await onSendReply(stageItemId, text);
      if (!result.ok) {
        setReplyError(result.error ?? 'Не удалось отправить ответ');
        return;
      }
      closeReplyComposer();
    } finally {
      setReplySending(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col sm:h-[min(75vh,40rem)] sm:min-h-[20rem] sm:flex-none">
      <Dialog open={deleteTarget != null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить файл из чата?</DialogTitle>
            <DialogDescription>
              Файл исчезнет из обсуждения с клиентом, но останется в библиотеке «Файлы клиентов».
            </DialogDescription>
          </DialogHeader>
          {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deletePending}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmDeleteMedia()}
              disabled={deletePending}
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {assignment ? (
        <AssignmentToolbar
          assignment={assignment}
          onShowStatistics={onShowStatistics}
          onEdit={onEditAssignment}
        />
      ) : null}
      {error ? <p className="mx-4 mt-3 text-sm text-destructive">{error}</p> : null}
      {nextCursor ? (
        <Button
          type="button"
          variant="outline"
          className="mx-4 mt-3 self-start"
          disabled={loading || loadingOlder}
          onClick={onLoadOlder}
        >
          {loadingOlder ? 'Загрузка...' : 'Показать предыдущие'}
        </Button>
      ) : null}
      <div
        ref={scrollRef}
        className={cn('min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3', chatThreadSurfaceClass)}
        data-testid="doctor-program-discussion-messages"
      >
        {sortedMessages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            {loading ? 'Загрузка...' : 'Пока нет сообщений.'}
          </p>
        ) : (
          sortedMessages.map((m, index) => {
            const fromPatient = m.senderRole === 'patient';
            const previousMessage = index > 0 ? sortedMessages[index - 1] : null;
            const startsNewDay =
              !previousMessage ||
              dayKeyFromIso(previousMessage.createdAt) !== dayKeyFromIso(m.createdAt);
            const itemLabel = showItemLabels ? itemLabelById.get(m.instanceStageItemId) : null;
            const peerCursor =
              peerLastReadAtByStageItemId?.[m.instanceStageItemId] ?? peerLastReadAt ?? null;
            const deliveryStatus = !fromPatient
              ? chatMessageDeliveryStatus({ createdAt: m.createdAt, peerLastReadAt: peerCursor })
              : null;
            const canDeleteMedia =
              fromPatient && Boolean(m.mediaFileId) && Boolean(onDeleteMediaMessage);
            return (
              <div key={m.id}>
                {startsNewDay ? (
                  <p className={cn(doctorMetaTextClass, 'mb-2 text-center')}>
                    {formatChatRelativeDateLabelRu(m.createdAt, new Date())}
                  </p>
                ) : null}
                <div
                  className={cn(
                    'group/row relative flex w-full flex-col gap-1',
                    fromPatient
                      ? canDeleteMedia
                        ? 'items-start pr-10'
                        : 'items-start'
                      : 'items-end',
                  )}
                  onClick={() => {
                    if (!fromPatient || !onSendReply || composerStageItemId) return;
                    if (ignoreTapMessageIdRef.current === m.id) {
                      ignoreTapMessageIdRef.current = null;
                      return;
                    }
                    openReplyComposer(m.id);
                  }}
                >
                  {itemLabel ? (
                    <p className={cn(doctorMetaTextClass, 'font-medium')}>{itemLabel}</p>
                  ) : null}
                  <div
                    className={cn(
                      'flex w-full max-w-full items-end',
                      !fromPatient && 'justify-end',
                    )}
                  >
                    <div
                      className={cn(
                        'relative min-w-0 w-fit rounded-md border px-3 py-2 shadow-sm',
                        doctorChatMessageTextClass,
                        fromPatient ? chatBubblePeerClass : chatBubbleOwnClass,
                      )}
                      style={{ maxWidth: DOCTOR_CHAT_BUBBLE_MAX_WIDTH }}
                      onTouchStart={
                        fromPatient && onSendReply && !composerStageItemId && touchEnabled
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
                        fromPatient && onSendReply && !composerStageItemId && touchEnabled
                          ? (event) => {
                              const state = touchDragRef.current;
                              const touch = event.touches[0];
                              if (
                                !state ||
                                !touch ||
                                state.messageId !== m.id ||
                                state.openedBySwipe
                              )
                                return;
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
                        fromPatient && onSendReply && !composerStageItemId && touchEnabled
                          ? () => {
                              touchDragRef.current = null;
                            }
                          : undefined
                      }
                      onTouchCancel={
                        fromPatient && onSendReply && !composerStageItemId && touchEnabled
                          ? () => {
                              touchDragRef.current = null;
                            }
                          : undefined
                      }
                    >
                      <ProgramItemDiscussionMessageBody
                        message={m}
                        mine={false}
                        textClassName={doctorChatMessageTextClass}
                        trailingContent={
                          !m.mediaFileId ? (
                            <DoctorChatBubbleMeta
                              timeLabel={formatChatMessageTimeRu(m.createdAt)}
                              deliveryStatus={deliveryStatus}
                            />
                          ) : null
                        }
                      />
                      {m.mediaFileId || !m.body?.trim() ? (
                        <p className="h-3">
                          <DoctorChatBubbleMeta
                            timeLabel={formatChatMessageTimeRu(m.createdAt)}
                            deliveryStatus={deliveryStatus}
                          />
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {canDeleteMedia ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className={cn(
                        'absolute bottom-1 size-8 rounded-full border-border/70 bg-background/95 shadow-sm transition-opacity',
                        'right-0',
                        touchEnabled && !supportsHover
                          ? 'opacity-100'
                          : 'pointer-events-none opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100',
                      )}
                      aria-label="Удалить файл из чата"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteError(null);
                        setDeleteTarget(m);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
      {(composerStageItemId || activeReplyMessage) && onSendReply ? (
        <MessageComposer
          value={replyDraft}
          onValueChange={setReplyDraft}
          onSubmit={() =>
            submitReply(composerStageItemId ?? activeReplyMessage!.instanceStageItemId)
          }
          submitting={replySending}
          placeholder="Ответ..."
          ariaLabel="Ответ пациенту"
          submitLabel={<ArrowUp className="size-4" aria-hidden />}
          submittingLabel={<ArrowUp className="size-4" aria-hidden />}
          submitAriaLabel="Отправить ответ"
          maxLength={4000}
          rows={1}
          textareaRef={textareaRef}
          submitInsideInput
          inputRowClassName="relative"
          className={cn(
            'shrink-0 border-t border-border bg-card px-4 py-3',
            replySending && 'opacity-50',
          )}
          header={
            activeReplyMessage && !composerStageItemId ? (
              <div className="mb-2 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    Ответ на:{' '}
                    {activeReplyMessage.body?.trim() ||
                      itemLabelById?.get(activeReplyMessage.instanceStageItemId) ||
                      'сообщение с вложением'}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 text-foreground/70 hover:text-foreground"
                    onClick={closeReplyComposer}
                    aria-label="Убрать выбранное сообщение"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            ) : null
          }
          status={replyError ? <p className="mt-1 text-xs text-destructive">{replyError}</p> : null}
          renderTextarea={(textareaProps) => (
            <Textarea
              {...textareaProps}
              className="min-h-10 resize-none rounded-[18px] py-2 pr-10 pl-3 leading-5"
              style={{ borderRadius: 18 }}
            />
          )}
          renderSubmit={(buttonProps) => (
            <Button
              {...buttonProps}
              size="icon"
              className="absolute size-8 rounded-full p-0"
              style={{ right: 3, bottom: 4, borderRadius: '9999px' }}
            />
          )}
        />
      ) : null}
    </div>
  );
}
