'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import type { ProgramItemDiscussionMessage } from '@/modules/program-item-discussion/types';
import { DoctorProgramDiscussionMessagesPanel } from './DoctorProgramDiscussionMessagesPanel';
import { markDoctorProgramDiscussionReadForStageItems } from '@/app/app/doctor/doctorProgramDiscussionMarkRead';
import { sendDoctorProgramDiscussionReply } from './doctorProgramDiscussionReply';
import { deleteDoctorProgramDiscussionMediaMessage } from './doctorProgramDiscussionDeleteMedia';
import { readSafeApiErrorText } from '@/shared/http/apiErrorCode';
import { useMessagePolling } from '@/modules/messaging/hooks/useMessagePolling';

export type DoctorProgramInstanceDiscussionItemOption = {
  id: string;
  label: string;
};

type DiscussionPageResponse = {
  ok?: boolean;
  error?: string;
  messages?: ProgramItemDiscussionMessage[];
  pageInfo?: {
    nextCursor?: string | null;
    stageItemIdFilter?: string | null;
  };
  peerLastReadAtByStageItemId?: Record<string, string | null>;
};

function compareMessages(a: ProgramItemDiscussionMessage, b: ProgramItemDiscussionMessage): number {
  const byDate = a.createdAt.localeCompare(b.createdAt);
  if (byDate !== 0) return byDate;
  return a.id.localeCompare(b.id);
}

function uniqueStageItemIds(messages: ProgramItemDiscussionMessage[]): string[] {
  return [...new Set(messages.map((m) => m.instanceStageItemId))];
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

export function DoctorProgramInstanceDiscussionDialog(props: {
  instanceId: string;
  programItems: DoctorProgramInstanceDiscussionItemOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRead?: (stageItemIds: string[]) => void;
}) {
  const { instanceId, programItems, open, onOpenChange, onRead } = props;
  const [messages, setMessages] = useState<ProgramItemDiscussionMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [peerLastReadAtByStageItemId, setPeerLastReadAtByStageItemId] = useState<
    Record<string, string | null>
  >({});
  const loadGenerationRef = useRef(0);
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;

  const itemLabelById = useMemo(
    () => new Map(programItems.map((item) => [item.id, item.label])),
    [programItems],
  );

  const basePath = useMemo(
    () => `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/discussion`,
    [instanceId],
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
        throw new Error(readSafeApiErrorText(data, 'Не удалось загрузить обсуждения'));
      }
      const loaded = data.messages;
      setMessages((current) => reconcileMessages(current, loaded, appendOlder));
      setNextCursor(
        typeof data.pageInfo?.nextCursor === 'string' ? data.pageInfo.nextCursor : null,
      );
      if (data.peerLastReadAtByStageItemId) {
        setPeerLastReadAtByStageItemId((prev) => ({
          ...prev,
          ...data.peerLastReadAtByStageItemId,
        }));
      }
      return loaded;
    },
    [basePath],
  );

  const markVisibleDiscussionRead = useCallback(
    (loaded: ProgramItemDiscussionMessage[]) => {
      const stageItemIds = uniqueStageItemIds(loaded);
      void markDoctorProgramDiscussionReadForStageItems({ instanceId, stageItemIds }).then(
        (markedStageItemIds) => {
          if (markedStageItemIds.length > 0) onReadRef.current?.(markedStageItemIds);
        },
      );
    },
    [instanceId],
  );

  const bootstrap = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    setLoading(true);
    setLoadingOlder(false);
    setError(null);
    setMessages([]);
    setNextCursor(null);
    try {
      const loaded = await loadPage(null, false, generation);
      if (loaded) {
        markVisibleDiscussionRead(loaded);
      }
    } catch (e) {
      if (generation !== loadGenerationRef.current) return;
      const msg = e instanceof Error ? e.message : 'Не удалось загрузить обсуждения';
      setError(msg);
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [loadPage, markVisibleDiscussionRead]);

  useEffect(() => {
    if (!open) return;
    void bootstrap();
  }, [open, bootstrap]);

  useEffect(() => {
    if (!open) {
      loadGenerationRef.current += 1;
      setMessages([]);
      setLoading(false);
      setLoadingOlder(false);
      setNextCursor(null);
      setError(null);
    }
  }, [open]);

  const poll = useCallback(async () => {
    const generation = loadGenerationRef.current;
    try {
      const loaded = await loadPage(null, false, generation);
      if (loaded) markVisibleDiscussionRead(loaded);
    } catch {
      // Открытый тред сохраняет уже загруженные сообщения при временном сетевом сбое.
    }
  }, [loadPage, markVisibleDiscussionRead]);

  useMessagePolling(poll, open, 8000, false);

  return (
    <DoctorModal
      open={open}
      onClose={() => onOpenChange(false)}
      title="Комментарии"
      size="content"
      bodyClassName="!p-0"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <DoctorProgramDiscussionMessagesPanel
          messages={messages}
          loading={loading}
          loadingOlder={loadingOlder}
          error={error}
          nextCursor={nextCursor}
          peerLastReadAtByStageItemId={peerLastReadAtByStageItemId}
          itemLabelById={itemLabelById}
          onSendReply={async (stageItemId, text) => {
            const sendResult = await sendDoctorProgramDiscussionReply({
              instanceId,
              stageItemId,
              text,
            });
            if (!sendResult.ok) return sendResult;

            const generation = loadGenerationRef.current;
            try {
              await loadPage(null, false, generation);
            } catch {
              if (generation === loadGenerationRef.current) {
                toast.error('Ответ отправлен, но список не обновился. Откройте обсуждение заново.');
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
                toast.error(
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
              .then((loaded) => {
                if (loaded) markVisibleDiscussionRead(loaded);
              })
              .catch((e) => {
                if (generation !== loadGenerationRef.current) return;
                setError(e instanceof Error ? e.message : 'Не удалось загрузить обсуждения');
              })
              .finally(() => {
                if (generation === loadGenerationRef.current) {
                  setLoadingOlder(false);
                }
              });
          }}
        />
      </div>
    </DoctorModal>
  );
}
