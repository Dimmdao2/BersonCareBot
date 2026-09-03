'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import {
  DoctorDnaFlatList,
  doctorDnaFlatListClickableClass,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListRowClass,
  doctorDnaFlatListSecondaryClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { DoctorAttentionBadge } from '@/shared/ui/doctor/DoctorAttentionBadge';
import { doctorSectionTitleClass } from '@/shared/ui/doctor/doctorVisual';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { ExerciseListCatalogThumb } from '@/shared/ui/doctor/media/ExerciseListCatalogThumb';
import { DoctorProgramItemDiscussionDialog } from '@/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/DoctorProgramItemDiscussionDialog';
import type { TodayExerciseCommentAttentionItem } from '../loadDoctorExerciseCommentAttention';
import {
  groupExerciseCommentAttentionByPatient,
  type ExerciseCommentAttentionPatientGroup,
} from './exerciseCommentAttentionGrouping';
import { thumbToExerciseMedia } from './exerciseCommentThumb';

function latestCommentPreview(item: TodayExerciseCommentAttentionItem): string {
  return (
    item.latestMessage.body
      ?.trim()
      .replace(/^\d{1,2}[./]\d{1,2}[./]\d{4}(?:,\s*\d{1,2}:\d{2})?\s*/, '') ||
    'Комментарий без текста'
  );
}

function ExerciseCommentRow({
  item,
  onOpen,
}: {
  item: TodayExerciseCommentAttentionItem;
  onOpen: () => void;
}) {
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
              className="min-w-0 flex-1 truncate text-[15px] leading-5 font-semibold text-foreground"
            >
              {item.stageItemTitle}
            </span>
            <DoctorAttentionBadge count={item.unreadCount ?? 1} className="shrink-0" />
          </span>
          <span className={cn(doctorDnaFlatListMetaClass, 'mt-0.5 block')}>
            {item.latestMessageAtLabel}
          </span>
          <span className={cn(doctorDnaFlatListSecondaryClass, 'mt-0.5 line-clamp-2')}>
            {latestCommentPreview(item)}
          </span>
        </span>
      </Button>
    </li>
  );
}

function PatientCommentGroup({
  group,
  onOpen,
}: {
  group: ExerciseCommentAttentionPatientGroup;
  onOpen: (item: TodayExerciseCommentAttentionItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const unreadCount = group.items.reduce((sum, item) => sum + (item.unreadCount ?? 1), 0);

  return (
    <section
      className="border-b border-border/60"
      aria-labelledby={`today-comments-${group.patientUserId}`}
    >
      <h3 className="m-0">
        <Button
          type="button"
          variant="ghost"
          className="h-auto w-full justify-start rounded-none bg-card px-[var(--doctor-list-inline-padding,18px)] py-3 text-left shadow-none"
          aria-expanded={expanded}
          aria-controls={`today-comments-list-${group.patientUserId}`}
          onClick={() => setExpanded((current) => !current)}
        >
          <span
            id={`today-comments-${group.patientUserId}`}
            className={cn(doctorSectionTitleClass, 'min-w-0 flex-1 truncate')}
          >
            {group.patientDisplayName}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-2">
            <DoctorAttentionBadge count={unreadCount} />
            <ChevronDown
              className={cn(
                'size-4 text-muted-foreground transition-transform',
                expanded && 'rotate-180',
              )}
              aria-hidden
            />
          </span>
        </Button>
      </h3>
      {expanded ? (
        <DoctorDnaFlatList
          id={`today-comments-list-${group.patientUserId}`}
          className="border-t border-border/60"
        >
          {group.items.map((item) => (
            <ExerciseCommentRow
              key={`${item.instanceId}:${item.stageItemId}`}
              item={item}
              onOpen={() => onOpen(item)}
            />
          ))}
        </DoctorDnaFlatList>
      ) : null}
    </section>
  );
}

export function DoctorTodayExerciseCommentsModal({
  open,
  onClose,
  items,
  onMarkedRead,
}: {
  open: boolean;
  onClose: () => void;
  items: TodayExerciseCommentAttentionItem[];
  onMarkedRead: (item: TodayExerciseCommentAttentionItem) => void;
}) {
  const [selectedItem, setSelectedItem] = useState<TodayExerciseCommentAttentionItem | null>(null);
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const groups = useMemo(() => groupExerciseCommentAttentionByPatient(items), [items]);

  const handleClose = () => {
    setDiscussionOpen(false);
    setSelectedItem(null);
    onClose();
  };

  const openDiscussion = (item: TodayExerciseCommentAttentionItem) => {
    setSelectedItem(item);
    window.requestAnimationFrame(() => setDiscussionOpen(true));
  };

  return (
    <>
      <DoctorModal
        open={open}
        onClose={handleClose}
        title="Комментарии"
        size="lg"
        bodyVariant="list"
        desktopPresentation="right-sheet"
      >
        {groups.length > 0 ? (
          groups.map((group) => (
            <PatientCommentGroup key={group.patientUserId} group={group} onOpen={openDiscussion} />
          ))
        ) : (
          <p className="px-4 py-4 text-center text-sm text-muted-foreground">
            Нет новых комментариев по упражнениям
          </p>
        )}
      </DoctorModal>

      {selectedItem ? (
        <DoctorProgramItemDiscussionDialog
          instanceId={selectedItem.instanceId}
          itemId={selectedItem.stageItemId}
          itemLabel={selectedItem.stageItemTitle}
          open={discussionOpen}
          onOpenChange={(nextOpen) => {
            setDiscussionOpen(nextOpen);
          }}
          onMarkedRead={() => onMarkedRead(selectedItem)}
        />
      ) : null}
    </>
  );
}
