'use client';

import type { ReactNode } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  DOCTOR_CHAT_BUBBLE_MAX_WIDTH,
  DoctorChatBubbleMeta,
} from '@/shared/ui/chat/DoctorChatBubbleMeta';
import {
  chatBubbleOwnClass,
  chatBubblePeerClass,
  chatThreadSurfaceClass,
} from '@/shared/ui/chat/chatThreadSurface';
import { isMessengerMiniAppHost } from '@/shared/lib/messengerMiniApp';
import { openExternalLinkInMessenger } from '@/shared/lib/openExternalLinkInMessenger';
import { patientCaptionTextClass, patientMutedTextClass } from '@/shared/ui/patient/patientVisual';
import { patientChatBubbleClass } from '@/shared/ui/patient/patientChatVisual';
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
  className?: string;
  onReplyToMessage?: (message: SerializedSupportMessage) => void;
  messageTextClassName?: string;
  dayLabelClassName?: string;
};

/** Каркас чата: группировка по дням, пузырьки, скролл вниз. */
export function ChatView({
  variant,
  messages,
  emptyText,
  composer,
  className,
  onReplyToMessage,
  messageTextClassName,
  dayLabelClassName,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(0);
  useLayoutEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    const hasExistingMessages = previousMessageCountRef.current > 0;
    scrollContainer.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior: hasExistingMessages ? 'smooth' : 'auto',
    });
    previousMessageCountRef.current = messages.length;
  }, [messages.length]);

  const grouped = groupMessagesByDay(messages);
  const scrollClasses = cn(
    'min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-4 pb-4 pt-1 md:pb-5',
    chatThreadSurfaceClass,
    variant === 'doctor' && 'px-4',
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
              variant === 'patient'
                ? cn('text-center', patientMutedTextClass)
                : 'text-center text-sm text-muted-foreground',
            )}
          >
            {emptyText ?? 'Пока нет сообщений.'}
          </p>
        ) : (
          grouped.map((g) => (
            <div key={g.dayKey}>
              <p
                className={cn(
                  'mb-2 text-center capitalize',
                  variant === 'doctor' ? dayLabelClassName : patientCaptionTextClass,
                )}
              >
                {g.items[0] ? formatChatRelativeDateLabelRu(g.items[0].createdAt, new Date()) : ''}
              </p>
              <div className="space-y-4">
                {g.items.map((m) => {
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
                        className={cn('flex w-full max-w-full items-end', mine && 'justify-end')}
                      >
                        <div
                          className={cn(
                            variant === 'doctor'
                              ? 'relative min-w-0 w-fit rounded-md px-3 py-2 shadow-sm'
                              : patientChatBubbleClass,
                            messageTextClassName,
                            mine ? chatBubbleOwnClass : chatBubblePeerClass,
                            variant === 'doctor' && !mine && onReplyToMessage && 'cursor-pointer',
                          )}
                          style={
                            variant === 'doctor'
                              ? { maxWidth: DOCTOR_CHAT_BUBBLE_MAX_WIDTH }
                              : undefined
                          }
                          onClick={
                            variant === 'doctor' && !mine && onReplyToMessage
                              ? () => onReplyToMessage(m)
                              : undefined
                          }
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
                              <DoctorChatBubbleMeta
                                timeLabel={formatChatMessageTimeRu(m.createdAt)}
                                deliveryStatus={deliveryStatus}
                                appearance={variant}
                              />
                            </p>
                          ) : (
                            <p className={variant === 'patient' ? 'h-4' : 'h-3'}>
                              <DoctorChatBubbleMeta
                                timeLabel={formatChatMessageTimeRu(m.createdAt)}
                                deliveryStatus={deliveryStatus}
                                appearance={variant}
                              />
                            </p>
                          )}
                        </div>
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
        <div
          className={cn(
            'mt-auto shrink-0',
            variant === 'doctor' &&
              'border-t border-border bg-card px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3',
          )}
        >
          {composer}
        </div>
      ) : null}
    </div>
  );
}
