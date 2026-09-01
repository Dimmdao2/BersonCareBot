'use client';

import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { TodayExerciseCommentAttentionItem } from '../loadDoctorExerciseCommentAttention';
import { ExerciseListCatalogThumb } from '@/shared/ui/doctor/media/ExerciseListCatalogThumb';
import {
  doctorDnaFlatListClickableClass,
  doctorDnaFlatListRowClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { thumbToExerciseMedia } from './exerciseCommentThumb';

export function ExerciseCommentPreviewItemContent({
  item,
  isOnSupport,
}: {
  item: TodayExerciseCommentAttentionItem;
  isOnSupport?: boolean;
}) {
  const bodyPreview =
    item.latestMessage.body
      ?.trim()
      .replace(/^\d{1,2}[./]\d{1,2}[./]\d{4}(?:,\s*\d{1,2}:\d{2})?\s*/, '') ||
    'Комментарий без текста';

  return (
    <div className="flex w-full min-w-0 items-start gap-2.5">
      <ExerciseListCatalogThumb media={thumbToExerciseMedia(item.thumb)} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {item.patientDisplayName}
            {isOnSupport ? (
              <span
                className="ml-1.5 text-[10px] font-semibold text-primary"
                title="На сопровождении"
              >
                ★
              </span>
            ) : null}
          </span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {item.latestMessageAtLabel}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.stageItemTitle}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-foreground/80">{bodyPreview}</p>
      </div>
    </div>
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
