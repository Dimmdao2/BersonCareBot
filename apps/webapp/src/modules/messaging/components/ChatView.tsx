'use client';

import type { ReactNode } from 'react';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { ChatBubbleOutgoingMeta } from '@/shared/ui/chat/ChatBubbleOutgoingMeta';
import {
  chatBubbleOwnClass,
  chatBubblePeerClass,
  chatThreadSurfaceClass,
} from '@/shared/ui/chat/chatThreadSurface';
import { isMessengerMiniAppHost } from '@/shared/lib/messengerMiniApp';
import { openExternalLinkInMessenger } from '@/shared/lib/openExternalLinkInMessenger';
import {
  patientBodyTextClass,
  patientChatMetaLineClass,
  patientMutedTextClass,
} from '@/shared/ui/patient/patientVisual';
import { chatMessageDeliveryStatus } from '../chatMessageDeliveryStatus';
import {
  formatChatMessageTimeRu,
  formatChatRelativeDateLabelRu,
  groupMessagesByDay,
} from '../messageFormatting';
import type { SerializedSupportMessage } from '../serializeSupportMessage';

type Variant = 'patient' | 'doctor';

function isAlignedRight(senderRole: string, variant: Variant): boolean {
  if (variant === 'patient') return senderRole === 'user';
  return senderRole === 'admin';
}

const bubbleRadiusPatientChatClass =
  'rounded-[var(--patient-card-radius-mobile)] md:rounded-[var(--patient-card-radius-desktop)]';

const URL_RE = /(https?:\/\/[^\s<>"']+)/gi;
const TRAILING_URL_PUNCTUATION_RE = /[),.;:!?]+$/;

function splitTrailingUrlPunctuation(value: string): { url: string; trailing: string } {
  const match = value.match(TRAILING_URL_PUNCTUATION_RE);
  if (!match?.[0]) return { url: value, trailing: '' };
  const trailing = match[0];
  return { url: value.slice(0, -trailing.length), trailing };
}

function renderMessageText(text: string) {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_RE)) {
    const rawUrl = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));
    const { url, trailing } = splitTrailingUrlPunctuation(rawUrl);
    parts.push(
      <a
        key={`${index}-${url}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium underline decoration-current/50 underline-offset-2 hover:decoration-current"
        onClick={(event) => {
          event.stopPropagation();
          if (!isMessengerMiniAppHost()) return;
          event.preventDefault();
          openExternalLinkInMessenger(url);
        }}
      >
        {url}
      </a>,
    );
    if (trailing) parts.push(trailing);
    lastIndex = index + rawUrl.length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : text;
}

type ChatViewProps = {
  variant: Variant;
  messages: SerializedSupportMessage[];
  emptyText?: string;
  composer?: ReactNode;
  /**
   * Пациент: подпись дата и время под пузырём (сегодня / вчера / 5 июня / … год),
   * без блоковых разделителей по дням.
   */
  relativeFooters?: boolean;
  className?: string;
  onReplyToMessage?: (message: SerializedSupportMessage) => void;
};

/** Каркас чата: группировка по дням, пузырьки, скролл вниз. */
export function ChatView({
  variant,
  messages,
  emptyText,
  composer,
  relativeFooters = false,
  className,
  onReplyToMessage,
}: ChatViewProps) {
  const patientRelative = variant === 'patient' && relativeFooters;
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  }, [messages.length]);

  const grouped = groupMessagesByDay(messages);
  const flatSorted = useMemo(
    () => [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [messages],
  );
  const scrollClasses = cn(
    'min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-4 pb-4 pt-1 md:pb-5',
    chatThreadSurfaceClass,
    variant === 'doctor' && 'px-3',
  );

  const patientBubbleMine = cn(
    'max-w-full px-3 py-2 text-sm shadow-sm md:max-w-[min(100%,24rem)]',
    bubbleRadiusPatientChatClass,
    chatBubbleOwnClass,
  );

  const patientBubbleOther = cn(
    'max-w-full px-3 py-2 text-sm shadow-sm md:max-w-[min(100%,24rem)]',
    bubbleRadiusPatientChatClass,
    chatBubblePeerClass,
  );

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}>
      <div
        ref={scrollRef}
        className={cn(scrollClasses, messages.length === 0 && 'flex items-center justify-center')}
      >
        {messages.length === 0 ? (
          <p
            className={cn(
              patientRelative
                ? cn('text-center', patientMutedTextClass)
                : 'text-center text-sm text-muted-foreground',
            )}
          >
            {emptyText ?? 'Пока нет сообщений.'}
          </p>
        ) : relativeFooters ? (
          flatSorted.map((m) => {
            const mine = isAlignedRight(m.senderRole, variant);
            const deliveryStatus = mine
              ? chatMessageDeliveryStatus({ createdAt: m.createdAt, readAt: m.readAt })
              : null;
            return (
              <div
                key={m.id}
                className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}
              >
                <div
                  className={cn(
                    'flex max-w-[min(100%,22rem)]',
                    mine ? 'justify-end' : 'justify-start',
                  )}
                >
                  <div className={mine ? patientBubbleMine : patientBubbleOther}>
                    {m.mediaUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.mediaUrl}
                        alt=""
                        className={cn(
                          'max-h-60 w-auto max-w-full rounded-lg',
                          m.text ? 'mb-1.5' : undefined,
                        )}
                      />
                    ) : null}
                    {m.text ? (
                      <p
                        className={cn(
                          'whitespace-pre-wrap break-words',
                          mine ? undefined : patientRelative ? patientBodyTextClass : undefined,
                        )}
                      >
                        {renderMessageText(m.text)}
                      </p>
                    ) : null}
                    {mine && deliveryStatus ? (
                      <ChatBubbleOutgoingMeta
                        timeLabel={formatChatMessageTimeRu(m.createdAt)}
                        deliveryStatus={deliveryStatus}
                      />
                    ) : null}
                  </div>
                </div>
                {!mine ? (
                  <p
                    className={cn(
                      'max-w-[min(100%,22rem)] md:max-w-[min(100%,24rem)]',
                      patientRelative
                        ? patientChatMetaLineClass
                        : 'text-[11px] leading-snug tabular-nums text-muted-foreground',
                      'text-start',
                    )}
                  >
                    {formatChatRelativeDateLabelRu(m.createdAt, new Date())} ·{' '}
                    {formatChatMessageTimeRu(m.createdAt)}
                  </p>
                ) : null}
                {onReplyToMessage ? (
                  <button
                    type="button"
                    className={cn(
                      'text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline',
                      patientRelative && patientMutedTextClass,
                    )}
                    onClick={() => onReplyToMessage(m)}
                  >
                    Ответить
                  </button>
                ) : null}
              </div>
            );
          })
        ) : (
          grouped.map((g) => (
            <div key={g.dayKey}>
              <p className="mb-2 text-center text-xs capitalize text-muted-foreground">
                {g.dayLabel}
              </p>
              <div className={variant === 'doctor' ? 'space-y-3' : 'space-y-2'}>
                {g.items.map((m) => {
                  const mine = isAlignedRight(m.senderRole, variant);
                  const deliveryStatus = mine
                    ? chatMessageDeliveryStatus({ createdAt: m.createdAt, readAt: m.readAt })
                    : null;
                  return (
                    <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                      <div
                        className={cn(
                          'max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                          mine ? chatBubbleOwnClass : chatBubblePeerClass,
                        )}
                      >
                        {m.mediaUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.mediaUrl}
                            alt=""
                            className={cn(
                              'max-h-60 w-auto max-w-full rounded-lg',
                              m.text ? 'mb-1.5' : undefined,
                            )}
                          />
                        ) : null}
                        {m.text ? (
                          <p className="whitespace-pre-wrap break-words">
                            {renderMessageText(m.text)}
                          </p>
                        ) : null}
                        {mine && deliveryStatus ? (
                          <ChatBubbleOutgoingMeta
                            timeLabel={formatChatMessageTimeRu(m.createdAt)}
                            deliveryStatus={deliveryStatus}
                          />
                        ) : (
                          <p className="mt-1 text-[10px] tabular-nums opacity-70">
                            {formatChatMessageTimeRu(m.createdAt)}
                          </p>
                        )}
                        {onReplyToMessage ? (
                          <button
                            type="button"
                            className="mt-1 block text-[11px] font-medium underline-offset-2 opacity-75 hover:underline hover:opacity-100"
                            onClick={() => onReplyToMessage(m)}
                          >
                            Ответить
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
      {composer != null ? (
        <div className={cn('mt-auto shrink-0', variant === 'doctor' && 'px-3')}>{composer}</div>
      ) : null}
    </div>
  );
}
