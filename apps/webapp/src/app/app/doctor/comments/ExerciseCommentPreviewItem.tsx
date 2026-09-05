'use client';

import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DoctorPatientName } from '@/shared/ui/doctor/DoctorSupportStar';
import type { TodayExerciseCommentAttentionItem } from '../loadDoctorExerciseCommentAttention';
import { ExerciseListCatalogThumb } from '@/shared/ui/doctor/media/ExerciseListCatalogThumb';
import {
  doctorDnaFlatListClickableClass,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
  doctorDnaFlatListSecondaryClass,
  doctorDnaFlatListUnreadTextClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { DoctorAttentionBadge } from '@/shared/ui/doctor/DoctorAttentionBadge';
import { doctorListPreviewTextClass } from '@/shared/ui/doctor/doctorVisual';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { thumbToExerciseMedia } from './exerciseCommentThumb';

/**
 * Текст последнего сообщения треда для строки списка: без ведущей даты, которую
 * пациентские клиенты иногда вклеивают в тело, и с явной подписью для медиа-сообщений.
 */
export function exerciseCommentBodyPreview(item: TodayExerciseCommentAttentionItem): string {
  return (
    item.latestMessage.body
      ?.trim()
      .replace(/^\d{1,2}[./]\d{1,2}[./]\d{4}(?:,\s*\d{1,2}:\d{2})?\s*/, '') ||
    'Комментарий без текста'
  );
}

export function ExerciseCommentPreviewItemContent({
  item,
  isOnSupport,
}: {
  item: TodayExerciseCommentAttentionItem;
  isOnSupport?: boolean;
}) {
  const bodyPreview = exerciseCommentBodyPreview(item);

  return (
    <div className="flex w-full min-w-0 items-start gap-2.5">
      <ExerciseListCatalogThumb media={thumbToExerciseMedia(item.thumb)} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <DoctorPatientName
            isOnSupport={isOnSupport}
            className={cn(
              'min-w-0 flex-1 truncate',
              doctorDnaFlatListPrimaryClass,
              doctorDnaFlatListUnreadTextClass,
            )}
          >
            {item.patientDisplayName}
          </DoctorPatientName>
          <span className={cn('ml-auto shrink-0', doctorDnaFlatListMetaClass)}>
            {item.latestMessageAtLabel}
          </span>
        </div>
        <p className={cn('mt-0.5 truncate', doctorDnaFlatListMetaClass)}>{item.stageItemTitle}</p>
        <p className={cn('mt-0.5 line-clamp-2', doctorDnaFlatListSecondaryClass)}>{bodyPreview}</p>
      </div>
    </div>
  );
}

/**
 * Единая строка «упражнение с комментариями»: превью, название, дата и текст последнего
 * сообщения, точный бейдж непрочитанных. Один и тот же ряд обслуживает KPI «Сегодня» и
 * модалку «Комментарии к ЛФК» — параллельного представления упражнения нет.
 *
 * Название непрочитанного упражнения немного плотнее (`UNREAD-04`, `LFK-COMMENTS-03`);
 * прочитанное остаётся обычного начертания.
 */
export function ExerciseCommentExerciseRow({
  item,
  onOpen,
}: {
  item: TodayExerciseCommentAttentionItem;
  onOpen: () => void;
}) {
  const unreadCount = item.unreadCount ?? 0;

  return (
    <li>
      <Button
        type="button"
        variant="ghost"
        onClick={onOpen}
        className={cn(
          doctorDnaFlatListRowClass,
          doctorDnaFlatListClickableClass,
          'h-auto w-full items-start whitespace-normal rounded-none bg-transparent text-left shadow-none',
        )}
      >
        <ExerciseListCatalogThumb media={thumbToExerciseMedia(item.thumb)} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-[15px] leading-5 text-foreground',
                unreadCount > 0 ? 'font-semibold' : 'font-normal',
              )}
            >
              {item.stageItemTitle}
            </span>
            {unreadCount > 0 ? (
              <DoctorAttentionBadge count={unreadCount} className="shrink-0" />
            ) : null}
          </span>
          <span className={cn(doctorDnaFlatListMetaClass, 'mt-0.5 block')}>
            {item.latestMessageAtLabel}
          </span>
          <span className={doctorListPreviewTextClass}>{exerciseCommentBodyPreview(item)}</span>
        </span>
      </Button>
    </li>
  );
}

/**
 * Shared flat-list row for comment previews in the mobile comments tab and
 * attention modal. Callers can add their own actions without reintroducing
 * per-row card chrome.
 */
export function ExerciseCommentPreviewListRow({
  item,
  onActivate,
  listItemProps,
  previewProps,
  children,
}: {
  item: TodayExerciseCommentAttentionItem;
  onActivate?: () => void;
  listItemProps?: ComponentProps<'li'>;
  previewProps?: ComponentProps<'div'>;
  children?: ReactNode;
}) {
  const { className, ...restListItemProps } = listItemProps ?? {};
  const { className: previewClassName, ...restPreviewProps } = previewProps ?? {};
  const content = <ExerciseCommentPreviewItemContent item={item} />;

  return (
    <li {...restListItemProps} className={cn('group/row relative', className)}>
      {onActivate ? (
        <Button
          type="button"
          variant="ghost"
          onClick={onActivate}
          className={cn(
            doctorDnaFlatListRowClass,
            doctorDnaFlatListClickableClass,
            'h-auto w-full items-start rounded-none bg-transparent text-left shadow-none',
          )}
        >
          {content}
        </Button>
      ) : (
        <div
          {...restPreviewProps}
          className={cn(doctorDnaFlatListRowClass, 'items-start', previewClassName)}
        >
          {content}
        </div>
      )}
      {children}
    </li>
  );
}
