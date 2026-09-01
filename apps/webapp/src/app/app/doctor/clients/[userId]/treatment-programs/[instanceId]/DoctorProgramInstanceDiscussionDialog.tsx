'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import type { ProgramItemDiscussionMessage } from '@/modules/program-item-discussion/types';
import { DoctorProgramDiscussionMessagesPanel } from './DoctorProgramDiscussionMessagesPanel';
import { markDoctorProgramDiscussionReadForStageItems } from '@/app/app/doctor/doctorProgramDiscussionMarkRead';
import { sendDoctorProgramDiscussionReply } from './doctorProgramDiscussionReply';
import { deleteDoctorProgramDiscussionMediaMessage } from './doctorProgramDiscussionDeleteMedia';

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

export function DoctorProgramInstanceDiscussionDialog(props: {
  instanceId: string;
  programItems: DoctorProgramInstanceDiscussionItemOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRead?: () => void;
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
        throw new Error(data?.error ?? 'Не удалось загрузить обсуждения');
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
      void markDoctorProgramDiscussionReadForStageItems({ instanceId, stageItemIds }).then(onRead);
    },
    [instanceId, onRead],
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

  useEffect(() => {
    if (!open) return;
    const refreshPeerRead = async () => {
      const url = new URL(basePath, window.location.origin);
      url.searchParams.set('direction', 'backward');
      url.searchParams.set('limit', '1');
      const res = await fetch(url.toString());
      const data = (await res.json().catch(() => null)) as DiscussionPageResponse | null;
      if (res.ok && data?.ok && data.peerLastReadAtByStageItemId) {
        setPeerLastReadAtByStageItemId((prev) => ({
          ...prev,
          ...data.peerLastReadAtByStageItemId,
        }));
      }
    };
    const id = window.setInterval(() => void refreshPeerRead(), 15000);
    return () => window.clearInterval(id);
  }, [open, basePath]);

  return (
    <DoctorModal open={open} onClose={() => onOpenChange(false)} title="Комментарии" size="content">
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
