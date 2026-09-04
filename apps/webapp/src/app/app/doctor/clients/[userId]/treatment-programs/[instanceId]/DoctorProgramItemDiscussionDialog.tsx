'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DoctorModal, DoctorModalStackedTitle } from '@/shared/ui/doctor/DoctorModal';
import type { ProgramItemDiscussionMessage } from '@/modules/program-item-discussion/types';
import {
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
import { DoctorExerciseStatisticsModal } from '@/app/app/doctor/treatment-program-shared/DoctorExerciseStatisticsModal';
import { readSafeApiErrorText } from '@/shared/http/apiErrorCode';
import { patientCardHref } from '@/app/app/doctor/patients/patientCardHref';
import { useMessagePolling } from '@/modules/messaging/hooks/useMessagePolling';

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

/**
 * Каноническая модалка упражнения: тред, рекомендации и переходы в статистику/редактирование.
 * Единственный вариант деталей упражнения — открывается и из «Сегодня → Комментарии», и из
 * списка упражнений этапа в карточке пациента, и из конструктора программы.
 */
export function DoctorProgramItemDiscussionDialog(props: {
  instanceId: string;
  itemId: string;
  itemLabel?: string;
  /** «Фамилия Имя» пациента для второй строки шапки; без него вторая строка не рисуется. */
  patientName?: string | null;
  patientUserId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMarkedRead?: () => void;
}) {
  const {
    instanceId,
    itemId,
    itemLabel,
    patientName,
    patientUserId: initialPatientUserId,
    open,
    onOpenChange,
    onMarkedRead,
  } = props;
  const [messages, setMessages] = useState<ProgramItemDiscussionMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [peerLastReadAt, setPeerLastReadAt] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<DoctorProgramDiscussionAssignment | null>(null);
  const [patientUserId, setPatientUserId] = useState<string | null>(initialPatientUserId ?? null);
  const [recommendationsEditable, setRecommendationsEditable] = useState(false);
  const [recommendationsOpen, setRecommendationsOpen] = useState(false);
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const loadGenerationRef = useRef(0);
  const onMarkedReadRef = useRef(onMarkedRead);
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
      if (!res.ok || !data?.ok || !Array.isArray(data.messages)) {
        throw new Error(readSafeApiErrorText(data, 'Не удалось загрузить обсуждение'));
      }
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

  const bootstrap = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    setLoading(true);
    setLoadingOlder(false);
    setError(null);
    setMessages([]);
    setNextCursor(null);
    setAssignment(null);
    setPatientUserId(initialPatientUserId ?? null);
    setRecommendationsEditable(false);
    setRecommendationsOpen(false);
    setStatisticsOpen(false);
    try {
      const loaded = await loadPage(null, false, generation);
      if (loaded) {
        void markDoctorProgramDiscussionRead({ instanceId, stageItemId: itemId }).then((result) => {
          if (result.ok) onMarkedReadRef.current?.();
        });
      }
    } catch (e) {
      if (generation !== loadGenerationRef.current) return;
      const msg = e instanceof Error ? e.message : 'Не удалось загрузить обсуждение';
      setError(msg);
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [loadPage, instanceId, itemId, initialPatientUserId]);

  useEffect(() => {
    if (!open) return;
    void bootstrap();
  }, [open, bootstrap]);

  const poll = useCallback(async () => {
    const generation = loadGenerationRef.current;
    try {
      const loaded = await loadPage(null, false, generation);
      if (!loaded) return;
      void markDoctorProgramDiscussionRead({ instanceId, stageItemId: itemId }).then((result) => {
        if (result.ok) onMarkedReadRef.current?.();
      });
    } catch {
      // Открытый тред сохраняет уже загруженные сообщения при временном сетевом сбое.
    }
  }, [instanceId, itemId, loadPage]);

  useMessagePolling(poll, open, 8000, false);

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
    setStatisticsOpen(false);
  }, [open]);

  return (
    <DoctorModal
      open={open}
      onClose={() => onOpenChange(false)}
      title={
        <DoctorModalStackedTitle
          label="Упражнение"
          entity={itemLabel}
          patientName={patientName}
          patientHref={patientUserId ? patientCardHref(patientUserId) : null}
        />
      }
      size="content"
      bodyClassName="!p-0"
    >
      <DoctorProgramDiscussionMessagesPanel
        messages={messages}
        loading={loading}
        loadingOlder={loadingOlder}
        error={error}
        nextCursor={nextCursor}
        peerLastReadAt={peerLastReadAt}
        assignment={assignment}
        onShowStatistics={
          recommendationsEditable && patientUserId ? () => setStatisticsOpen(true) : undefined
        }
        onEditAssignment={recommendationsEditable ? () => setRecommendationsOpen(true) : undefined}
        composerStageItemId={itemId}
        onSendReply={async (_stageItemId, text) => {
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
              setError('Ответ отправлен, но список не обновился. Откройте обсуждение заново.');
            }
          }
          return { ok: true as const };
        }}
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
              setError('Файл удалён из чата, но список не обновился. Откройте обсуждение заново.');
            }
          }
          return { ok: true as const };
        }}
        onLoadOlder={() => {
          if (!nextCursor) return;
          const generation = loadGenerationRef.current;
          setLoadingOlder(true);
          void loadPage(nextCursor, true, generation)
            .catch((e) => {
              if (generation !== loadGenerationRef.current) return;
              setError(e instanceof Error ? e.message : 'Не удалось загрузить обсуждение');
            })
            .finally(() => {
              if (generation === loadGenerationRef.current) {
                setLoadingOlder(false);
              }
            });
        }}
      />
      {assignment && recommendationsEditable ? (
        <DoctorExerciseRecommendationsModal
          open={recommendationsOpen}
          onClose={() => setRecommendationsOpen(false)}
          instanceId={instanceId}
          itemId={itemId}
          exerciseTitle={itemLabel ?? 'Упражнение'}
          patientName={patientName}
          patientUserId={patientUserId}
          initialValue={assignment}
          onSaved={({ value }) => {
            setAssignment((current) => (current ? { ...current, ...value } : current));
          }}
        />
      ) : null}
      {patientUserId && recommendationsEditable ? (
        <DoctorExerciseStatisticsModal
          open={statisticsOpen}
          onClose={() => setStatisticsOpen(false)}
          patientUserId={patientUserId}
          patientName={patientName}
          exerciseTitle={itemLabel ?? 'Упражнение'}
          instanceId={instanceId}
          itemId={itemId}
        />
      ) : null}
    </DoctorModal>
  );
}
