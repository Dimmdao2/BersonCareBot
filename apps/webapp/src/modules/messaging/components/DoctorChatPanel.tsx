'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import { MessageComposer } from '@/shared/ui/chat/MessageComposer';
import { cn } from '@/lib/utils';
import { ChatView } from '@/modules/messaging/components/ChatView';
import { notifyDoctorSupportUnreadCountChanged } from '@/modules/messaging/hooks/useSupportUnreadPolling';
import { useMessagePolling } from '@/modules/messaging/hooks/useMessagePolling';
import type { SerializedSupportMessage } from '@/modules/messaging/serializeSupportMessage';

type DoctorChatPanelProps = {
  conversationId: string;
  initialMessages?: SerializedSupportMessage[];
  className?: string;
  emptyText?: string;
  onReadStateChanged?: () => void | Promise<void>;
  onSent?: () => void | Promise<void>;
};

export function DoctorChatPanel({
  conversationId,
  initialMessages,
  className,
  emptyText = 'Нет сообщений в этом диалоге.',
  onReadStateChanged,
  onSent,
}: DoctorChatPanelProps) {
  const [messages, setMessages] = useState<SerializedSupportMessage[]>(initialMessages ?? []);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(!initialMessages);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<SerializedSupportMessage | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Persists across retries of the same unsent draft so a network-error retry reuses the same
  // idempotency key instead of minting a new one (which would defeat server-side dedup). Keyed
  // by text so editing the draft after a failed attempt starts a fresh key, not a "retry".
  const pendingSendRef = useRef<{ text: string; key: string } | null>(null);

  const markRead = useCallback(async () => {
    try {
      const res = await fetch(`/api/doctor/messages/${encodeURIComponent(conversationId)}/read`, {
        method: 'POST',
      });
      if (res.ok) {
        notifyDoctorSupportUnreadCountChanged();
        await onReadStateChanged?.();
      }
    } catch {
      // Read state is best-effort; keep the chat usable if it fails.
    }
  }, [conversationId, onReadStateChanged]);

  const loadMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/doctor/messages/${encodeURIComponent(conversationId)}`);
      const data = (await res.json()) as { ok?: boolean; messages?: SerializedSupportMessage[] };
      if (!res.ok || !data.ok) {
        setError('Не удалось загрузить сообщения');
        return;
      }
      setMessages(data.messages ?? []);
      await markRead();
    } catch {
      setError('Не удалось загрузить сообщения');
    }
  }, [conversationId, markRead]);

  useEffect(() => {
    let cancelled = false;
    setDraft('');
    setError(null);
    setLoading(true);
    (async () => {
      try {
        setReplyTarget(null);
        if (initialMessages) {
          if (!cancelled) setMessages(initialMessages);
          await markRead();
        } else {
          await loadMessages();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, initialMessages, loadMessages, markRead]);

  const poll = useCallback(async () => {
    if (!conversationId) return;
    try {
      const res = await fetch(`/api/doctor/messages/${encodeURIComponent(conversationId)}`);
      const data = (await res.json()) as { ok?: boolean; messages?: SerializedSupportMessage[] };
      if (!res.ok || !data.ok) return;
      const list = data.messages ?? [];
      setMessages(list);
      if (list.some((m) => m.senderRole === 'user' && !m.readAt)) {
        await markRead();
      }
    } catch {
      // Polling is best-effort; keep current messages and avoid noisy UI flapping.
    }
  }, [conversationId, markRead]);

  useMessagePolling(poll, Boolean(conversationId), 18000);

  const send = async () => {
    const t = draft.trim();
    if (!t || sending) return;
    setSending(true);
    setError(null);
    const idempotencyKey =
      pendingSendRef.current?.text === t ? pendingSendRef.current.key : crypto.randomUUID();
    pendingSendRef.current = { text: t, key: idempotencyKey };
    try {
      const res = await fetch(`/api/doctor/messages/${encodeURIComponent(conversationId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t, idempotencyKey }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || !data.ok) {
        setError('Не отправлено');
        return;
      }
      pendingSendRef.current = null;
      setDraft('');
      setReplyTarget(null);
      await loadMessages();
      await onSent?.();
    } catch {
      setError('Ошибка сети');
    } finally {
      setSending(false);
    }
  };

  const replyToMessage = useCallback((message: SerializedSupportMessage) => {
    setReplyTarget(message);
    textareaRef.current?.focus();
  }, []);

  const composer = (
    <MessageComposer
      value={draft}
      onValueChange={setDraft}
      onSubmit={send}
      submitting={sending}
      placeholder="Ответ..."
      ariaLabel="Текст ответа"
      submitLabel="Отправить"
      submittingLabel="Отправка..."
      maxLength={4000}
      textareaRef={textareaRef}
      className="flex shrink-0 flex-col gap-2 border-t border-border pt-3"
      header={
        replyTarget ? (
          <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1 truncate">
                Ответ на: {replyTarget.text || 'сообщение с вложением'}
              </span>
              <button
                type="button"
                className="shrink-0 font-medium text-foreground/70 hover:text-foreground"
                onClick={() => setReplyTarget(null)}
                aria-label="Убрать выбранное сообщение"
              >
                x
              </button>
            </div>
          </div>
        ) : null
      }
      renderTextarea={(props) => <Textarea {...props} className="min-h-[88px] resize-y" />}
      renderSubmit={(props) => <Button {...props} />}
    />
  );

  if (loading) {
    return <p className={cn('text-sm text-muted-foreground', className)}>Загрузка сообщений...</p>;
  }

  return (
    <div className={cn('flex min-h-0 min-w-0 flex-col', className)}>
      {error ? <p className="mb-2 shrink-0 text-sm text-destructive">{error}</p> : null}
      <ChatView
        variant="doctor"
        messages={messages}
        emptyText={emptyText}
        composer={composer}
        className="min-h-0 flex-1"
        onReplyToMessage={replyToMessage}
      />
    </div>
  );
}
