'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  DoctorModal,
  DoctorModalFooter,
  DoctorModalStackedTitle,
} from '@/shared/ui/doctor/DoctorModal';
import type { ProgramItemDiscussionMessage } from '@/modules/program-item-discussion/types';
import {
  AssignmentToolbar,
  DoctorProgramDiscussionMessagesPanel,
  type DoctorProgramDiscussionAssignment,
} from './DoctorProgramDiscussionMessagesPanel';
import { markDoctorProgramDiscussionRead } from '@/app/app/doctor/doctorProgramDiscussionMarkRead';
import { sendDoctorProgramDiscussionReply } from './doctorProgramDiscussionReply';
import { deleteDoctorProgramDiscussionMediaMessage } from './doctorProgramDiscussionDeleteMedia';
import { resolveStageItemExerciseLoad } from '@/app/app/patient/treatment/stageItemSnapshot';
import { firstSnapshotMedia } from '@/app/app/doctor/comments/exerciseCommentThumb';
import { thumbToExerciseMedia } from '@/app/app/doctor/comments/exerciseCommentThumb';
import { DoctorExerciseRecommendationsModal } from '@/app/app/doctor/treatment-program-shared/DoctorExerciseRecommendationsModal';
import {
  DoctorExerciseStatisticsPanel,
  type DoctorExerciseStatisticsView,
} from '@/app/app/doctor/treatment-program-shared/DoctorExerciseStatisticsModal';
import { readSafeApiErrorText } from '@/shared/http/apiErrorCode';
import { patientCardHref } from '@/app/app/doctor/patients/patientCardHref';
import { useMessagePolling } from '@/modules/messaging/hooks/useMessagePolling';
import { notifyDoctorExerciseCommentsChanged } from '@/shared/ui/doctor/shell/doctorShellBadgeEvents';
import { notificationText } from '@/shared/notifications/notificationText';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { cn } from '@/lib/utils';

type DiscussionPageResponse = {
  ok?: boolean;
  error?: string;
  messages?: ProgramItemDiscussionMessage[];
  pageInfo?: {
    nextCursor?: string | null;
  };
  peerLastReadAt?: string | null;
  itemContext?: {
    patientUserId?: string;
    itemType: string;
    settings?: Record<string, unknown> | null;
    snapshot?: Record<string, unknown> | null;
    effectiveComment?: string | null;
  };
};

function compareMessages(a: ProgramItemDiscussionMessage, b: ProgramItemDiscussionMessage): number {
  const byDate = a.createdAt.localeCompare(b.createdAt);
  if (byDate !== 0) return byDate;
  return a.id.localeCompare(b.id);
}

function reconcileMessages(
  current: ProgramItemDiscussionMessage[],
  incoming: ProgramItemDiscussionMessage[],
  appendOlder: boolean,
): ProgramItemDiscussionMessage[] {
  if (appendOlder) {
    const byId = new Map(incoming.map((message) => [message.id, message]));
    for (const message of current) byId.set(message.id, message);
    return [...byId.values()].sort(compareMessages);
  }
  const currentById = new Map(current.map((message) => [message.id, message]));
  let changed = current.length !== incoming.length;
  const next = incoming.map((message, index) => {
    const existing = currentById.get(message.id);
    if (!existing) {
      changed = true;
      return message;
    }
    if (current[index] !== existing) changed = true;
    return existing;
  });
  return changed ? next : current;
}

function ExerciseStatisticsViewToggle({
  value,
  onChange,
}: {
  value: DoctorExerciseStatisticsView;
  onChange: (value: DoctorExerciseStatisticsView) => void;
}) {
  return (
    <div className="grid w-full grid-cols-2 gap-1 rounded-lg border border-primary/25 bg-primary/10 p-1">
      {(
        [
          ['dynamics', 'Динамика'],
          ['journal', 'Журнал выполнения'],
        ] as const
      ).map(([nextValue, label]) => {
        const active = value === nextValue;
        return (
          <Button
            key={nextValue}
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={active}
            className={cn(
              'min-w-0 border text-sm',
              active
                ? 'border-primary/25 bg-card font-medium text-primary shadow-sm hover:bg-card hover:text-primary'
                : 'border-transparent bg-transparent text-primary shadow-none hover:bg-primary/10 hover:text-primary',
            )}
            onClick={() => onChange(nextValue)}
          >
            <span className="truncate">{label}</span>
          </Button>
        );
      })}
    </div>
  );
}

/**
 * Каноническая модалка упражнения с двумя контекстными входами:
 * из этапа сначала открываются детали, из коммуникаций — комментарии.
 */
export function DoctorProgramItemDiscussionDialog(props: {
  initialView?: 'details' | 'comments';
  instanceId: string;
  itemId: string;
  itemLabel?: string;
  /** «Фамилия Имя» пациента для второй строки шапки; без него вторая строка не рисуется. */
  patientName?: string | null;
  patientUserId?: string | null;
  patientOnSupport?: boolean;
  patientVariant?: 'link' | 'context';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMarkedRead?: () => void;
}) {
  const {
    initialView = 'details',
    instanceId,
    itemId,
    itemLabel,
    patientName,
    patientOnSupport = false,
    patientVariant = 'link',
    patientUserId: initialPatientUserId,
    open,
    onOpenChange,
    onMarkedRead,
  } = props;
  const commentsFirst = initialView === 'comments';
  const [messages, setMessages] = useState<ProgramItemDiscussionMessage[]>([]);
  const [discussionAvailable, setDiscussionAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [peerLastReadAt, setPeerLastReadAt] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<DoctorProgramDiscussionAssignment | null>(null);
  const [patientUserId, setPatientUserId] = useState<string | null>(initialPatientUserId ?? null);
  const [recommendationsEditable, setRecommendationsEditable] = useState(false);
  const [recommendationsOpen, setRecommendationsOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [exerciseView, setExerciseView] = useState<DoctorExerciseStatisticsView>('dynamics');
  const loadGenerationRef = useRef(0);
  const onMarkedReadRef = useRef(onMarkedRead);
  const lastMarkedPatientMessageIdRef = useRef<string | null>(null);
  const markingPatientMessageIdRef = useRef<string | null>(null);
  onMarkedReadRef.current = onMarkedRead;

  const basePath = useMemo(
    () =>
      `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(itemId)}/discussion`,
    [instanceId, itemId],
  );

  const loadPage = useCallback(
    async (
      cursor: string | null,
      appendOlder: boolean,
      generation: number,
    ): Promise<ProgramItemDiscussionMessage[] | null> => {
      const url = new URL(basePath, window.location.origin);
      url.searchParams.set('direction', 'backward');
      url.searchParams.set('limit', '50');
      if (cursor) url.searchParams.set('cursor', cursor);
      const res = await fetch(url.toString());
      const data = (await res.json().catch(() => null)) as DiscussionPageResponse | null;
      if (generation !== loadGenerationRef.current) return null;
      if (res.status === 404) {
        setDiscussionAvailable(false);
        setMessages([]);
        setNextCursor(null);
        setPeerLastReadAt(null);
        setAssignment(null);
        setError(null);
        return [];
      }
      if (!res.ok || !data?.ok || !Array.isArray(data.messages)) {
        throw new Error(
          readSafeApiErrorText(data, notificationText.patientProgramItemDiscussionLoadFailed),
        );
      }
      setDiscussionAvailable(true);
      const loaded = data.messages;
      setMessages((current) => reconcileMessages(current, loaded, appendOlder));
      setNextCursor(
        typeof data.pageInfo?.nextCursor === 'string' ? data.pageInfo.nextCursor : null,
      );
      if (data.peerLastReadAt !== undefined) {
        setPeerLastReadAt(data.peerLastReadAt);
      }
      if (data.itemContext) {
        const load = resolveStageItemExerciseLoad(data.itemContext);
        setPatientUserId(data.itemContext.patientUserId ?? null);
        setRecommendationsEditable(data.itemContext.itemType === 'exercise');
        setAssignment({
          media: thumbToExerciseMedia(firstSnapshotMedia(data.itemContext.snapshot ?? {})),
          reps: load.reps,
          sets: load.sets,
          maxPain: load.maxPain,
          weightKg: load.weightKg,
          note: data.itemContext.effectiveComment?.trim() || null,
        });
      }
      return loaded;
    },
    [basePath],
  );

  const markLatestPatientMessageRead = useCallback(
    (loaded: ProgramItemDiscussionMessage[]) => {
      const latestPatientMessage = [...loaded]
        .reverse()
        .find((message) => message.senderRole === 'patient');
      if (
        !latestPatientMessage ||
        latestPatientMessage.id === lastMarkedPatientMessageIdRef.current ||
        latestPatientMessage.id === markingPatientMessageIdRef.current
      ) {
        return;
      }
      markingPatientMessageIdRef.current = latestPatientMessage.id;
      void markDoctorProgramDiscussionRead({ instanceId, stageItemId: itemId }).then((result) => {
        if (markingPatientMessageIdRef.current === latestPatientMessage.id) {
          markingPatientMessageIdRef.current = null;
        }
        if (!result.ok) return;
        lastMarkedPatientMessageIdRef.current = latestPatientMessage.id;
        notifyDoctorExerciseCommentsChanged();
        onMarkedReadRef.current?.();
      });
    },
    [instanceId, itemId],
  );

  const bootstrap = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    setLoading(true);
    setDiscussionAvailable(true);
    setLoadingOlder(false);
    setError(null);
    setMessages([]);
    setDiscussionAvailable(true);
    setNextCursor(null);
    setAssignment(null);
    setPatientUserId(initialPatientUserId ?? null);
    setRecommendationsEditable(false);
    setRecommendationsOpen(false);
    setCommentsOpen(false);
    setStatisticsOpen(false);
    setExerciseView('dynamics');
    lastMarkedPatientMessageIdRef.current = null;
    markingPatientMessageIdRef.current = null;
    try {
      const loaded = await loadPage(null, false, generation);
      if (commentsFirst && loaded) markLatestPatientMessageRead(loaded);
    } catch (e) {
      if (generation !== loadGenerationRef.current) return;
      const msg = e instanceof Error ? e.message : 'Не удалось загрузить обсуждение';
      setError(msg);
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [commentsFirst, initialPatientUserId, loadPage, markLatestPatientMessageRead]);

  useEffect(() => {
    if (!open) return;
    void bootstrap();
  }, [open, bootstrap]);

  const poll = useCallback(async () => {
    const generation = loadGenerationRef.current;
    try {
      const loaded = await loadPage(null, false, generation);
      if (!loaded) return;
      markLatestPatientMessageRead(loaded);
    } catch {
      // Открытый тред сохраняет уже загруженные сообщения при временном сетевом сбое.
    }
  }, [loadPage, markLatestPatientMessageRead]);

  useMessagePolling(poll, open && (commentsFirst || commentsOpen), 8000, false);

  useEffect(() => {
    if (open) return;
    loadGenerationRef.current += 1;
    setMessages([]);
    setLoading(false);
    setLoadingOlder(false);
    setError(null);
    setNextCursor(null);
    setAssignment(null);
    setPatientUserId(null);
    setCommentsOpen(false);
    setStatisticsOpen(false);
  }, [open]);

  const openComments = useCallback(() => {
    setCommentsOpen(true);
    const generation = loadGenerationRef.current;
    void loadPage(null, false, generation)
      .then((loaded) => {
        if (loaded) markLatestPatientMessageRead(loaded);
      })
      .catch(() => {
        // Вложенная модалка покажет уже загруженный тред и текущее сообщение об ошибке.
      });
  }, [loadPage, markLatestPatientMessageRead]);

  const messagesPanel = (
    <DoctorProgramDiscussionMessagesPanel
      messages={messages}
      loading={loading}
      loadingOlder={loadingOlder}
      error={error}
      nextCursor={nextCursor}
      peerLastReadAt={peerLastReadAt}
      composerStageItemId={discussionAvailable ? itemId : undefined}
      onSendReply={
        discussionAvailable
          ? async (_stageItemId, text) => {
              const sendResult = await sendDoctorProgramDiscussionReply({
                instanceId,
                stageItemId: itemId,
                text,
              });
              if (!sendResult.ok) return sendResult;
              const generation = loadGenerationRef.current;
              try {
                await loadPage(null, false, generation);
              } catch {
                if (generation === loadGenerationRef.current) {
                  toast.error(notificationText.doctorReplySentListStale);
                }
              }
              return { ok: true as const };
            }
          : undefined
      }
      onDeleteMediaMessage={async (messageId) => {
        const deleteResult = await deleteDoctorProgramDiscussionMediaMessage({
          instanceId,
          messageId,
        });
        if (!deleteResult.ok) return deleteResult;
        const generation = loadGenerationRef.current;
        try {
          await loadPage(null, false, generation);
        } catch {
          if (generation === loadGenerationRef.current) {
            toast.error(notificationText.doctorFileDeletedListStale);
          }
        }
        return { ok: true as const };
      }}
      onLoadOlder={() => {
        if (!nextCursor) return;
        const generation = loadGenerationRef.current;
        setLoadingOlder(true);
        void loadPage(nextCursor, true, generation)
          .catch((loadError) => {
            if (generation !== loadGenerationRef.current) return;
            setError(
              loadError instanceof Error ? loadError.message : 'Не удалось загрузить обсуждение',
            );
          })
          .finally(() => {
            if (generation === loadGenerationRef.current) {
              setLoadingOlder(false);
            }
          });
      }}
    />
  );

  return (
    <DoctorModal
      variant="panel"
      open={open}
      onClose={() => onOpenChange(false)}
      title={
        <DoctorModalStackedTitle
          label={commentsFirst ? 'Комментарии' : 'Упражнение'}
          entity={itemLabel}
          patientName={patientName}
          patientHref={patientUserId ? patientCardHref(patientUserId) : null}
          patientOnSupport={patientOnSupport}
          patientVariant={patientVariant}
        />
      }
      size="content"
      bodyClassName="!p-0 flex flex-col overflow-hidden"
    >
      {assignment ? (
        <AssignmentToolbar
          assignment={assignment}
          onEdit={recommendationsEditable ? () => setRecommendationsOpen(true) : undefined}
          onOpenComments={!commentsFirst ? openComments : undefined}
          onOpenStatistics={
            commentsFirst && patientUserId ? () => setStatisticsOpen(true) : undefined
          }
        />
      ) : null}
      {commentsFirst ? (
        messagesPanel
      ) : patientUserId ? (
        <DoctorExerciseStatisticsPanel
          active={open}
          patientUserId={patientUserId}
          instanceId={instanceId}
          itemId={itemId}
          view={exerciseView}
        />
      ) : error ? (
        <p className="px-4 py-4 text-sm text-destructive">{error}</p>
      ) : null}
      {!commentsFirst && patientUserId ? (
        <DoctorModalFooter layout="content">
          <ExerciseStatisticsViewToggle value={exerciseView} onChange={setExerciseView} />
        </DoctorModalFooter>
      ) : null}
      {assignment && recommendationsEditable ? (
        <DoctorExerciseRecommendationsModal
          open={recommendationsOpen}
          onClose={() => setRecommendationsOpen(false)}
          instanceId={instanceId}
          itemId={itemId}
          exerciseTitle={itemLabel ?? 'Упражнение'}
          patientName={patientName}
          patientUserId={patientUserId}
          patientOnSupport={patientOnSupport}
          patientVariant={patientVariant}
          initialValue={assignment}
          onSaved={({ value }) => {
            setAssignment((current) => (current ? { ...current, ...value } : current));
          }}
        />
      ) : null}
      {!commentsFirst ? (
        <DoctorModal
          variant="panel"
          open={commentsOpen}
          onClose={() => setCommentsOpen(false)}
          title={
            <DoctorModalStackedTitle
              label="Комментарии"
              entity={itemLabel}
              patientName={patientName}
              patientHref={patientUserId ? patientCardHref(patientUserId) : null}
              patientOnSupport={patientOnSupport}
              patientVariant={patientVariant}
            />
          }
          size="content"
          bodyClassName="!p-0"
        >
          {messagesPanel}
        </DoctorModal>
      ) : null}
      {commentsFirst && patientUserId ? (
        <DoctorModal
          variant="panel"
          open={statisticsOpen}
          onClose={() => setStatisticsOpen(false)}
          title={
            <DoctorModalStackedTitle
              label="Статистика"
              entity={itemLabel}
              patientName={patientName}
              patientHref={patientCardHref(patientUserId)}
              patientOnSupport={patientOnSupport}
              patientVariant={patientVariant}
            />
          }
          size="content"
          bodyClassName="!p-0 flex flex-col overflow-hidden"
        >
          <DoctorExerciseStatisticsPanel
            active={open && statisticsOpen}
            patientUserId={patientUserId}
            instanceId={instanceId}
            itemId={itemId}
            view={exerciseView}
          />
          <DoctorModalFooter layout="content">
            <ExerciseStatisticsViewToggle value={exerciseView} onChange={setExerciseView} />
          </DoctorModalFooter>
        </DoctorModal>
      ) : null}
    </DoctorModal>
  );
}
