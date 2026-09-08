'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/shared/ui/patient/primitives/button';
import { PatientModal } from '@/shared/ui/patient/PatientModal';
import type { ProgramItemDiscussionMessage } from '@/modules/program-item-discussion/types';
import { cn } from '@/lib/utils';
import { patientCaptionTextClass, patientMutedTextClass } from '@/shared/ui/patient/patientVisual';
import {
  dayKeyFromIso,
  formatChatMessageTimeRu,
  formatChatRelativeDateLabelRu,
} from '@/modules/messaging/messageFormatting';
import { chatMessageDeliveryStatus } from '@/modules/messaging/chatMessageDeliveryStatus';
import { DoctorChatBubbleMeta } from '@/shared/ui/chat/DoctorChatBubbleMeta';
import {
  chatBubbleOwnClass,
  chatBubblePeerClass,
  chatThreadSurfaceClass,
} from '@/shared/ui/chat/chatThreadSurface';
import { ProgramItemDiscussionMediaPicker } from '@/app/app/patient/treatment/ProgramItemDiscussionMediaPicker';
import { ProgramItemDiscussionMessageBody } from '@/app/app/patient/treatment/ProgramItemDiscussionMessageBody';
import { notifyPatientSupportUnreadCountChanged } from '@/modules/messaging/hooks/useSupportUnreadPolling';
import { readSafeApiErrorText } from '@/shared/http/apiErrorCode';
import { AppContentLoading } from '@/shared/ui/AppContentLoading';
import { useMessagePolling } from '@/modules/messaging/hooks/useMessagePolling';
import { reconcileMessagesById } from '@/modules/messaging/reconcileMessages';
import { PatientChatComposer } from '@/shared/ui/patient/PatientChatComposer';
import {
  patientChatBubbleClass,
  patientChatBubbleRowClass,
} from '@/shared/ui/patient/patientChatVisual';
import { usePatientOrganizationContext } from '@/shared/ui/patient/organization/PatientOrganizationContext';

type DiscussionPageResponse = {
  ok?: boolean;
  error?: string;
  messages?: ProgramItemDiscussionMessage[];
  pageInfo?: {
    nextCursor?: string | null;
  };
  peerLastReadAt?: string | null;
};

function compareMessages(a: ProgramItemDiscussionMessage, b: ProgramItemDiscussionMessage): number {
  const byDate = a.createdAt.localeCompare(b.createdAt);
  if (byDate !== 0) return byDate;
  return a.id.localeCompare(b.id);
}

function sameDiscussionMessage(
  a: ProgramItemDiscussionMessage,
  b: ProgramItemDiscussionMessage,
): boolean {
  return (
    a.id === b.id &&
    a.instanceStageItemId === b.instanceStageItemId &&
    a.patientUserId === b.patientUserId &&
    a.senderRole === b.senderRole &&
    a.origin === b.origin &&
    a.body === b.body &&
    a.mediaFileId === b.mediaFileId &&
    a.supportMessageId === b.supportMessageId &&
    a.createdAt === b.createdAt
  );
}

/**
 * Обсуждение пункта программы у пациента: канонический `PatientModal size="content"`.
 * Тред владеет своим скроллом, composer закреплён внизу тела, шапка не уезжает.
 */
export function ProgramItemDiscussionDialog(props: {
  instanceId: string;
  itemId: string;
  /** Название упражнения/пункта во второй строке шапки; без него строка не рисуется. */
  itemLabel?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRead?: () => void | Promise<void>;
  mediaSubmissionEnabled?: boolean;
}) {
  const {
    instanceId,
    itemId,
    itemLabel,
    open,
    onOpenChange,
    onRead,
    mediaSubmissionEnabled = false,
  } = props;
  const organizationTitle = usePatientOrganizationContext()?.organization.title.trim() || null;
  const [messages, setMessages] = useState<ProgramItemDiscussionMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [peerLastReadAt, setPeerLastReadAt] = useState<string | null>(null);
  const messagesRef = useRef(messages);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTailMessageIdRef = useRef<string | null>(null);
  const onReadRef = useRef(onRead);
  messagesRef.current = messages;
  onReadRef.current = onRead;

  const basePath = useMemo(
    () =>
      `/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(itemId)}/discussion`,
    [instanceId, itemId],
  );

  const markRead = useCallback(async () => {
    const res = await fetch(`${basePath}/read`, { method: 'POST' });
    if (!res.ok) return false;
    notifyPatientSupportUnreadCountChanged();
    await onReadRef.current?.();
    return true;
  }, [basePath]);

  const loadPage = useCallback(
    async (cursor: string | null, mode: 'replace' | 'older' | 'poll') => {
      const url = new URL(basePath, window.location.origin);
      url.searchParams.set('direction', 'backward');
      url.searchParams.set('limit', '50');
      if (cursor) url.searchParams.set('cursor', cursor);
      const res = await fetch(url.toString());
      const data = (await res.json().catch(() => null)) as DiscussionPageResponse | null;
      if (!res.ok || !data?.ok || !Array.isArray(data.messages)) {
        throw new Error(readSafeApiErrorText(data, 'Не удалось загрузить комментарии'));
      }
      const loaded = data.messages;
      setMessages((current) => {
        const reconciled = reconcileMessagesById(
          current,
          loaded,
          sameDiscussionMessage,
          mode !== 'replace',
        );
        return reconciled === current ? current : reconciled.sort(compareMessages);
      });
      if (mode !== 'poll') {
        setNextCursor(
          typeof data.pageInfo?.nextCursor === 'string' ? data.pageInfo.nextCursor : null,
        );
      }
      if (data.peerLastReadAt !== undefined) {
        setPeerLastReadAt(data.peerLastReadAt);
      }
      return loaded;
    },
    [basePath],
  );

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadPage(null, 'replace');
      await markRead();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Не удалось загрузить комментарии';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [loadPage, markRead]);

  useEffect(() => {
    if (!open) return;
    void bootstrap();
  }, [open, bootstrap]);

  const poll = useCallback(async () => {
    if (!open) return;
    try {
      const knownIds = new Set(messagesRef.current.map((message) => message.id));
      const loaded = await loadPage(null, 'poll');
      if (loaded.some((message) => message.senderRole !== 'patient' && !knownIds.has(message.id))) {
        await markRead();
      }
    } catch {
      // Polling is best-effort; keep the mounted thread stable on transient failures.
    }
  }, [loadPage, markRead, open]);

  useMessagePolling(poll, open, 8000, false);

  const sendText = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const res = await fetch(basePath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        message?: ProgramItemDiscussionMessage | null;
      } | null;
      if (!res.ok || !data?.ok) {
        toast.error(readSafeApiErrorText(data, 'Не удалось отправить комментарий'));
        return;
      }
      setDraft('');
      if (data.message) {
        setMessages((prev) => {
          const map = new Map(prev.map((m) => [m.id, m]));
          map.set(data.message!.id, data.message!);
          return [...map.values()].sort(compareMessages);
        });
      }
      void onRead?.();
    } catch {
      toast.error('Ошибка сети');
    } finally {
      setSending(false);
    }
  }, [basePath, draft, onRead, sending]);

  const sortedMessages = useMemo(() => [...messages].sort(compareMessages), [messages]);

  useLayoutEffect(() => {
    const scrollContainer = scrollRef.current;
    const tailMessageId = sortedMessages.at(-1)?.id ?? null;
    if (!scrollContainer || tailMessageId === lastTailMessageIdRef.current) return;
    if (typeof scrollContainer.scrollTo === 'function') {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: lastTailMessageIdRef.current ? 'smooth' : 'auto',
      });
    } else {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
    lastTailMessageIdRef.current = tailMessageId;
  }, [sortedMessages]);

  useEffect(() => {
    if (!open) lastTailMessageIdRef.current = null;
  }, [open]);

  return (
    <PatientModal
      open={open}
      onClose={() => onOpenChange(false)}
      title="Комментарии"
      titleSubject={itemLabel ?? undefined}
      headerAction={
        organizationTitle ? (
          <span className={cn(patientCaptionTextClass, 'max-w-40 truncate text-right')}>
            {organizationTitle}
          </span>
        ) : null
      }
      size="content"
      bodyClassName="p-0"
    >
      {/* Mobile: колонка занимает drawer целиком; desktop: комфортная фиксированная высота треда. */}
      <div className="flex min-h-0 flex-1 flex-col md:h-[min(75vh,34rem)] md:min-h-[20rem] md:flex-none">
        {error ? (
          <p className={cn(patientMutedTextClass, 'mx-4 mt-3 patient-text-danger-accent')}>
            {error}
          </p>
        ) : null}
        {nextCursor ? (
          <Button
            type="button"
            variant="outline"
            className="mx-4 mt-3 self-start"
            disabled={loading || loadingOlder}
            onClick={() => {
              if (!nextCursor) return;
              setLoadingOlder(true);
              void loadPage(nextCursor, 'older')
                .catch((e) => {
                  const msg = e instanceof Error ? e.message : 'Не удалось загрузить комментарии';
                  setError(msg);
                })
                .finally(() => setLoadingOlder(false));
            }}
          >
            {loadingOlder ? 'Загрузка...' : 'Показать предыдущие'}
          </Button>
        ) : null}

        <div
          ref={scrollRef}
          className={cn(
            'min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3',
            chatThreadSurfaceClass,
          )}
        >
          {sortedMessages.length === 0 ? (
            loading ? (
              <AppContentLoading className="py-6" />
            ) : (
              <p className={cn('text-center', patientMutedTextClass)}>Пока нет комментариев.</p>
            )
          ) : (
            sortedMessages.map((m, index) => {
              const mine = m.senderRole === 'patient';
              const previousMessage = index > 0 ? sortedMessages[index - 1] : null;
              const startsNewDay =
                !previousMessage ||
                dayKeyFromIso(previousMessage.createdAt) !== dayKeyFromIso(m.createdAt);
              const deliveryStatus = mine
                ? chatMessageDeliveryStatus({ createdAt: m.createdAt, peerLastReadAt })
                : null;
              return (
                <div key={m.id}>
                  {startsNewDay ? (
                    <p className={cn(patientCaptionTextClass, 'mb-2 text-center')}>
                      {formatChatRelativeDateLabelRu(m.createdAt, new Date())}
                    </p>
                  ) : null}
                  <div className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}>
                    <div className={cn(patientChatBubbleRowClass, mine && 'justify-end')}>
                      <div
                        className={cn(
                          patientChatBubbleClass,
                          mine ? chatBubbleOwnClass : chatBubblePeerClass,
                        )}
                      >
                        <ProgramItemDiscussionMessageBody
                          message={m}
                          mine={mine}
                          trailingContent={
                            !m.mediaFileId && m.body?.trim() ? (
                              <DoctorChatBubbleMeta
                                timeLabel={formatChatMessageTimeRu(m.createdAt)}
                                deliveryStatus={deliveryStatus}
                                appearance="patient"
                              />
                            ) : null
                          }
                        />
                        {m.mediaFileId || !m.body?.trim() ? (
                          <p className="h-4">
                            <DoctorChatBubbleMeta
                              timeLabel={formatChatMessageTimeRu(m.createdAt)}
                              deliveryStatus={deliveryStatus}
                              appearance="patient"
                            />
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <PatientChatComposer
          value={draft}
          onValueChange={setDraft}
          onSubmit={sendText}
          submitting={sending}
          disabled={loading}
          placeholder="Ваш комментарий..."
          ariaLabel="Текст комментария"
          submitAriaLabel="Отправить"
          maxLength={4000}
          className="px-4"
          leadingControl={
            mediaSubmissionEnabled ? (
              <ProgramItemDiscussionMediaPicker
                instanceId={instanceId}
                itemId={itemId}
                disabled={sending || loading}
                onUploaded={() => bootstrap()}
                onError={(message) =>
                  toast.error(
                    message === 'video_too_short'
                      ? 'Видео должно быть не короче 10 секунд'
                      : 'Не удалось загрузить файл',
                  )
                }
              />
            ) : null
          }
        />
      </div>
    </PatientModal>
  );
}
