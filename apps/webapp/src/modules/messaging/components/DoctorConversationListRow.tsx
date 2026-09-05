'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { DoctorPatientName } from '@/shared/ui/doctor/DoctorSupportStar';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorAttentionBadge } from '@/shared/ui/doctor/DoctorAttentionBadge';
import { doctorListPreviewTextClass } from '@/shared/ui/doctor/doctorVisual';
import {
  DoctorDnaFlatListSelectionStrip,
  doctorDnaFlatListClickableClass,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
  doctorDnaFlatListSecondaryClass,
  doctorDnaFlatListSelectedPrimaryClass,
  doctorDnaFlatListUnreadTextClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';

export type DoctorConversationListRowData = {
  conversationId: string;
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  phoneNormalized?: string | null;
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
  variant?: 'default' | 'unread-preview';
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

export function DoctorConversationListRow({
  conversation,
  displayIana = 'Europe/Moscow',
  selected = false,
  variant = 'default',
  href,
  onClick,
}: DoctorConversationListRowProps) {
  const hasStructuredName = Boolean(conversation.lastName ?? conversation.firstName);
  const isUnreadPreview = variant === 'unread-preview';
  const content = (
    <>
      {selected ? <DoctorDnaFlatListSelectionStrip /> : null}
      <div className="min-w-0 flex-1 overflow-hidden">
        <div
          className={cn(
            'flex justify-between gap-2',
            isUnreadPreview ? 'items-center' : 'items-baseline',
          )}
        >
          <DoctorPatientName
            isOnSupport={conversation.onSupport === true}
            className={cn(
              'min-w-0 truncate',
              doctorDnaFlatListPrimaryClass,
              selected && doctorDnaFlatListSelectedPrimaryClass,
              conversation.unreadFromUserCount > 0 && doctorDnaFlatListUnreadTextClass,
            )}
          >
            {hasStructuredName
              ? [conversation.lastName, conversation.firstName].filter(Boolean).join(' ')
              : conversation.displayName || 'Без имени'}
          </DoctorPatientName>
          <span className="flex shrink-0 items-center gap-1.5">
            <span
              className={cn(
                doctorDnaFlatListMetaClass,
                !isUnreadPreview &&
                  conversation.unreadFromUserCount > 0 &&
                  doctorDnaFlatListUnreadTextClass,
              )}
            >
              {formatConversationTime(conversation.lastMessageAt, displayIana)}
            </span>
            {isUnreadPreview ? (
              <DoctorAttentionBadge count={conversation.unreadFromUserCount} />
            ) : null}
          </span>
        </div>
        {conversation.lastMessageText ? (
          <p
            className={cn(
              isUnreadPreview
                ? doctorListPreviewTextClass
                : cn('mt-0.5 truncate', doctorDnaFlatListSecondaryClass),
              !isUnreadPreview &&
                conversation.unreadFromUserCount > 0 &&
                doctorDnaFlatListUnreadTextClass,
            )}
          >
            {conversation.lastSenderRole === 'admin' ? <span>Вы: </span> : null}
            {conversation.lastMessageText}
          </p>
        ) : null}
      </div>
      {!isUnreadPreview ? (
        <DoctorAttentionBadge count={conversation.unreadFromUserCount} className="self-center" />
      ) : null}
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
