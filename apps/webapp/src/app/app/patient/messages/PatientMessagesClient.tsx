'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { usePatientOrganizationContext } from '@/shared/ui/patient/organization/PatientOrganizationContext';
import { ChatView } from '@/modules/messaging/components/ChatView';
import { useMessagePolling } from '@/modules/messaging/hooks/useMessagePolling';
import { notifyPatientSupportUnreadCountChanged } from '@/modules/messaging/hooks/useSupportUnreadPolling';
import type { SerializedSupportMessage } from '@/modules/messaging/serializeSupportMessage';
import {
  reconcileMessagesById,
  reconcileSupportMessages,
  sameSerializedSupportMessage,
} from '@/modules/messaging/reconcileMessages';
import { cn } from '@/lib/utils';
import {
  patientCaptionTextClass,
  patientCardClass,
  patientInnerPageStackClass,
  patientMutedTextClass,
  patientSectionTitleClass,
} from '@/shared/ui/patient/patientVisual';
import { PatientChatComposer } from '@/shared/ui/patient/PatientChatComposer';
import { AppContentLoading } from '@/shared/ui/AppContentLoading';

/**
 * 1:1 обращение пациента на самостоятельной странице кабинета.
 *
 * Шапка треда — назначение слева, активная организация простым текстом справа: контракт поддержки
 * (`GET /api/patient/messages`) не отдаёт назначенного врача, поэтому имя человека не
 * выдумывается и не хардкодится.
 */
export function PatientMessagesClient() {
  const organizationContext = usePatientOrganizationContext();
  const organizationTitle = organizationContext?.organization.title.trim() || 'Клиника';
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SerializedSupportMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Закрытое обращение остаётся видимым и читаемым, но писать в него нельзя. Форму отправки в этом
   * случае не показываем вовсе: кнопка, которая появляется и затем отбивается сервером, хуже, чем
   * её отсутствие. Флаг приходит с сервера (`readOnly`), тем же предикатом, что и отказ POST.
   */
  const [readOnly, setReadOnly] = useState(false);

  const loadBootstrap = useCallback(async () => {
    const res = await fetch('/api/patient/messages');
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      conversationId?: string;
      messages?: SerializedSupportMessage[];
      readOnly?: boolean;
    };
    if (!res.ok || !data.ok || !data.conversationId) {
      setError(data.error ?? 'Ошибка загрузки');
      return;
    }
    setConversationId(data.conversationId);
    setMessages((current) => reconcileSupportMessages(current, data.messages ?? []));
    setReadOnly(data.readOnly === true);
    const readRes = await fetch('/api/patient/messages/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: data.conversationId }),
    });
    if (readRes.ok) notifyPatientSupportUnreadCountChanged();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await loadBootstrap();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadBootstrap]);

  const poll = useCallback(async () => {
    if (!conversationId) return;
    try {
      const fullRes = await fetch(
        `/api/patient/messages?conversationId=${encodeURIComponent(conversationId)}`,
      );
      const fullData = (await fullRes.json()) as {
        ok?: boolean;
        messages?: SerializedSupportMessage[];
        readOnly?: boolean;
      };
      if (!fullRes.ok || !fullData.ok || !Array.isArray(fullData.messages)) return;
      const polledMessages = fullData.messages;
      setMessages((current) => reconcileSupportMessages(current, polledMessages));
      setReadOnly(fullData.readOnly === true);
      const readRes = await fetch('/api/patient/messages/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      });
      if (readRes.ok) notifyPatientSupportUnreadCountChanged();
    } catch {
      // Polling is best-effort.
    }
  }, [conversationId]);

  useMessagePolling(poll, Boolean(conversationId), 8000, false);

  const send = async () => {
    const t = draft.trim();
    if (!t || !conversationId || sending || readOnly) return;
    setSending(true);
    try {
      const res = await fetch('/api/patient/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t, conversationId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: SerializedSupportMessage;
      };
      if (!res.ok || !data.ok) {
        // Обращение закрыли, пока форма была открыта — убираем форму, а не показываем код ошибки.
        if (data.error === 'conversation_closed') {
          setReadOnly(true);
          return;
        }
        toast.error(data.error ?? 'Не отправлено');
        return;
      }
      setDraft('');
      if (data.message) {
        setMessages((current) =>
          reconcileMessagesById(current, [data.message!], sameSerializedSupportMessage, true).sort(
            (a, b) => a.createdAt.localeCompare(b.createdAt),
          ),
        );
      }
    } catch {
      toast.error('Ошибка сети');
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      className={cn(
        patientCardClass,
        'patient-messages-page-thread flex flex-col gap-3 overflow-hidden',
      )}
    >
      <div className="flex min-w-0 shrink-0 items-start justify-between gap-3 border-b border-[var(--patient-border)] pb-3">
        <h2 className={patientSectionTitleClass}>Сообщения</h2>
        <p className={cn(patientCaptionTextClass, 'min-w-0 truncate text-right')}>
          {organizationTitle}
        </p>
      </div>
      {loading ? (
        <AppContentLoading className="flex-1 py-6" />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {error ? (
            <p className={cn(patientCaptionTextClass, 'shrink-0 patient-text-danger-accent')}>
              {error}
            </p>
          ) : null}
          <ChatView
            variant="patient"
            messages={messages}
            emptyText={
              readOnly
                ? 'В этом обращении нет сообщений.'
                : 'Напишите сообщение поддержке — ответ появится здесь.'
            }
            className="min-h-0 flex-1"
            composer={
              readOnly ? (
                <p
                  data-testid="patient-messages-readonly-notice"
                  className={cn(
                    patientMutedTextClass,
                    'shrink-0 border-t border-[var(--patient-border)] bg-[var(--patient-card-bg)] pt-3 text-center md:pt-4',
                    patientInnerPageStackClass,
                  )}
                >
                  Обращение закрыто. Историю можно читать, но написать в него уже нельзя — создайте
                  новое обращение.
                </p>
              ) : (
                <PatientChatComposer
                  value={draft}
                  onValueChange={setDraft}
                  onSubmit={send}
                  submitting={sending}
                  placeholder="Ваше сообщение…"
                  ariaLabel="Текст сообщения"
                  submitAriaLabel="Отправить"
                  maxLength={4000}
                />
              )
            }
          />
        </div>
      )}
    </section>
  );
}
