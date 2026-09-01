'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorAttentionBadge } from '@/shared/ui/doctor/DoctorAttentionBadge';
import {
  DoctorDnaFlatListSelectionStrip,
  doctorDnaFlatListClickableClass,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
  doctorDnaFlatListSelectedPrimaryClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';

export type DoctorConversationListRowData = {
  conversationId: string;
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  lastMessageAt: string;
  lastMessageText: string | null;
  lastSenderRole?: string | null;
  unreadFromUserCount: number;
  onSupport?: boolean;
};

type DoctorConversationListRowProps = {
  conversation: DoctorConversationListRowData;
  displayIana?: string;
  selected?: boolean;
  href?: string;
  onClick?: () => void;
};

function formatConversationTime(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  const time = date.toLocaleString('ru-RU', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  });
  if (isToday) return time;
  const dayMonth = date.toLocaleString('ru-RU', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
  });
  return `${dayMonth} · ${time}`;
}

function getSenderPrefix(conversation: DoctorConversationListRowData): string {
  if (conversation.lastSenderRole === 'admin') return 'Вы';
  return (
    conversation.firstName || (conversation.displayName.split(' ')[0] ?? '').trim() || 'Пациент'
  );
}

export function DoctorConversationListRow({
  conversation,
  displayIana = 'Europe/Moscow',
  selected = false,
  href,
  onClick,
}: DoctorConversationListRowProps) {
  const hasStructuredName = Boolean(conversation.lastName ?? conversation.firstName);
  const content = (
    <>
      {selected ? <DoctorDnaFlatListSelectionStrip /> : null}
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              'min-w-0 truncate',
              doctorDnaFlatListPrimaryClass,
              selected && doctorDnaFlatListSelectedPrimaryClass,
              conversation.unreadFromUserCount > 0 && '!font-semibold',
            )}
          >
            {hasStructuredName
              ? [conversation.lastName, conversation.firstName].filter(Boolean).join(' ')
              : conversation.displayName || 'Без имени'}
            {conversation.onSupport ? (
              <span className="ml-1.5 text-[10px] font-semibold text-primary">★</span>
            ) : null}
          </span>
          <span
            className={cn(
              'shrink-0',
              doctorDnaFlatListMetaClass,
              conversation.unreadFromUserCount > 0 && '!font-semibold',
            )}
          >
            {formatConversationTime(conversation.lastMessageAt, displayIana)}
          </span>
        </div>
        {hasStructuredName ? (
          <p
            className={cn(
              'truncate',
              doctorDnaFlatListMetaClass,
              conversation.unreadFromUserCount > 0 && '!font-semibold',
            )}
          >
            {conversation.displayName}
          </p>
        ) : null}
        {conversation.lastMessageText ? (
          <p
            className={cn(
              'mt-0.5 truncate',
              doctorDnaFlatListMetaClass,
              conversation.unreadFromUserCount > 0 && '!font-semibold',
            )}
          >
            <span
              className={cn(
                'font-medium text-foreground/80',
                conversation.unreadFromUserCount > 0 && '!font-semibold',
              )}
            >
              {getSenderPrefix(conversation)}:
            </span>{' '}
            {conversation.lastMessageText}
          </p>
        ) : null}
      </div>
      <DoctorAttentionBadge count={conversation.unreadFromUserCount} className="self-center" />
    </>
  );
  const rowClassName = cn(
    doctorDnaFlatListRowClass,
    doctorDnaFlatListClickableClass,
    'h-auto w-full rounded-none bg-transparent text-left shadow-none',
  );

  if (href) {
    return (
      <Link href={href} className={rowClassName}>
        {content}
      </Link>
    );
  }

  return (
    <Button type="button" variant="ghost" onClick={onClick} className={rowClassName}>
      {content}
    </Button>
  );
}
