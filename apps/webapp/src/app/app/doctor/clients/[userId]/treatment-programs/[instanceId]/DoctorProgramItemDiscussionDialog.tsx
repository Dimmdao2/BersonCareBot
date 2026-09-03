'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import type { ProgramItemDiscussionMessage } from '@/modules/program-item-discussion/types';
import {
  DoctorProgramDiscussionMessagesPanel,
  type DoctorProgramDiscussionAssignment,
  type DoctorProgramDiscussionExecutionMetrics,
} from './DoctorProgramDiscussionMessagesPanel';
import { markDoctorProgramDiscussionRead } from '@/app/app/doctor/doctorProgramDiscussionMarkRead';
import { sendDoctorProgramDiscussionReply } from './doctorProgramDiscussionReply';
import { deleteDoctorProgramDiscussionMediaMessage } from './doctorProgramDiscussionDeleteMedia';
import { resolveStageItemExerciseLoad } from '@/app/app/patient/treatment/stageItemSnapshot';
import { firstSnapshotMedia } from '@/app/app/doctor/comments/exerciseCommentThumb';
import { thumbToExerciseMedia } from '@/app/app/doctor/comments/exerciseCommentThumb';
import { DoctorExerciseRecommendationsModal } from '@/app/app/doctor/treatment-program-shared/DoctorExerciseRecommendationsModal';

type DiscussionPageResponse = {
  ok?: boolean;
  error?: string;
  messages?: ProgramItemDiscussionMessage[];
  pageInfo?: {
    nextCursor?: string | null;
  };
  peerLastReadAt?: string | null;
  itemContext?: {
    itemType: string;
    settings?: Record<string, unknown> | null;
    snapshot?: Record<string, unknown> | null;
    effectiveComment?: string | null;
  };
  executionMetricsByMessageId?: Record<string, DoctorProgramDiscussionExecutionMetrics>;
};

function compareMessages(a: ProgramItemDiscussionMessage, b: ProgramItemDiscussionMessage): number {
  const byDate = a.createdAt.localeCompare(b.createdAt);
  if (byDate !== 0) return byDate;
  return a.id.localeCompare(b.id);
}

export function DoctorProgramItemDiscussionDialog(props: {
  instanceId: string;
  itemId: string;
  itemLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMarkedRead?: () => void;
}) {
  const { instanceId, itemId, itemLabel, open, onOpenChange, onMarkedRead } = props;
  const [messages, setMessages] = useState<ProgramItemDiscussionMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [peerLastReadAt, setPeerLastReadAt] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<DoctorProgramDiscussionAssignment | null>(null);
  const [recommendationsEditable, setRecommendationsEditable] = useState(false);
  const [recommendationsOpen, setRecommendationsOpen] = useState(false);
  const [executionMetricsByMessageId, setExecutionMetricsByMessageId] = useState<
    Record<string, DoctorProgramDiscussionExecutionMetrics>
  >({});
  const loadGenerationRef = useRef(0);
  const onMarkedReadRef = useRef(onMarkedRead);
  onMarkedReadRef.current = onMarkedRead;

  const basePath = useMemo(
    () =>
      `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(itemId)}/discussion`,
    [instanceId, itemId],
  );

  const loadPage = useCallback(
    async (cursor: string | null, appendOlder: boolean, generation: number) => {
      const url = new URL(basePath, window.location.origin);
      url.searchParams.set('direction', 'backward');
      url.searchParams.set('limit', '50');
      if (cursor) url.searchParams.set('cursor', cursor);
      const res = await fetch(url.toString());
      const data = (await res.json().catch(() => null)) as DiscussionPageResponse | null;
      if (generation !== loadGenerationRef.current) return;
      if (!res.ok || !data?.ok || !Array.isArray(data.messages)) {
        throw new Error(data?.error ?? 'Не удалось загрузить обсуждение');
      }
      const loaded = data.messages;
      setMessages((prev) => {
        if (!appendOlder) return loaded;
        const map = new Map(prev.map((m) => [m.id, m]));
        for (const msg of loaded) map.set(msg.id, msg);
        return [...map.values()].sort(compareMessages);
      });
      setNextCursor(
        typeof data.pageInfo?.nextCursor === 'string' ? data.pageInfo.nextCursor : null,
      );
      if (data.peerLastReadAt !== undefined) {
        setPeerLastReadAt(data.peerLastReadAt);
      }
      if (data.itemContext) {
        const load = resolveStageItemExerciseLoad(data.itemContext);
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
      if (data.executionMetricsByMessageId) {
        setExecutionMetricsByMessageId((current) =>
          appendOlder
            ? { ...current, ...data.executionMetricsByMessageId }
            : data.executionMetricsByMessageId!,
        );
      }
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
    setRecommendationsEditable(false);
    setRecommendationsOpen(false);
    setExecutionMetricsByMessageId({});
    try {
      await loadPage(null, false, generation);
      void markDoctorProgramDiscussionRead({ instanceId, stageItemId: itemId }).then((result) => {
        if (result.ok) onMarkedReadRef.current?.();
      });
    } catch (e) {
      if (generation !== loadGenerationRef.current) return;
      const msg = e instanceof Error ? e.message : 'Не удалось загрузить обсуждение';
      setError(msg);
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [loadPage, instanceId, itemId]);

  useEffect(() => {
    if (!open) return;
    void bootstrap();
  }, [open, bootstrap]);

  useEffect(() => {
    if (!open) return;
    const refreshPeerRead = async () => {
      const url = new URL(basePath, window.location.origin);
      url.searchParams.set('direction', 'backward');
      url.searchParams.set('limit', '1');
      const res = await fetch(url.toString());
      const data = (await res.json().catch(() => null)) as DiscussionPageResponse | null;
      if (res.ok && data?.ok && data.peerLastReadAt !== undefined) {
        setPeerLastReadAt(data.peerLastReadAt);
      }
    };
    const id = window.setInterval(() => void refreshPeerRead(), 15000);
    return () => window.clearInterval(id);
  }, [open, basePath]);

  useEffect(() => {
    if (open) return;
    loadGenerationRef.current += 1;
    setMessages([]);
    setLoading(false);
    setLoadingOlder(false);
    setError(null);
    setNextCursor(null);
    setAssignment(null);
    setExecutionMetricsByMessageId({});
  }, [open]);

  return (
    <>
      <DoctorModal
        open={open}
        onClose={() => onOpenChange(false)}
        title={itemLabel ? `Обсуждение: ${itemLabel}` : 'Обсуждение'}
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
          onEditAssignment={
            recommendationsEditable ? () => setRecommendationsOpen(true) : undefined
          }
          executionMetricsByMessageId={executionMetricsByMessageId}
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
                setError(
                  'Файл удалён из чата, но список не обновился. Откройте обсуждение заново.',
                );
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
      </DoctorModal>

      {assignment && recommendationsEditable ? (
        <DoctorExerciseRecommendationsModal
          open={recommendationsOpen}
          onClose={() => setRecommendationsOpen(false)}
          instanceId={instanceId}
          itemId={itemId}
          exerciseTitle={itemLabel ?? 'Упражнение'}
          media={assignment.media}
          initialValue={assignment}
          onSaved={({ value }) => {
            setAssignment((current) => (current ? { ...current, ...value } : current));
          }}
        />
      ) : null}
    </>
  );
}
