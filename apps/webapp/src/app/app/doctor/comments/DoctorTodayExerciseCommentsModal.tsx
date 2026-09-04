'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import { DoctorDnaFlatList } from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { DoctorAttentionBadge } from '@/shared/ui/doctor/DoctorAttentionBadge';
import { doctorSectionTitleClass } from '@/shared/ui/doctor/doctorVisual';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorProgramItemDiscussionDialog } from '@/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/DoctorProgramItemDiscussionDialog';
import { formatDoctorFioShort } from '@/shared/lib/fio';
import type { TodayExerciseCommentAttentionItem } from '../loadDoctorExerciseCommentAttention';
import {
  groupExerciseCommentAttentionByPatient,
  type ExerciseCommentAttentionPatientGroup,
} from './exerciseCommentAttentionGrouping';
import { ExerciseCommentExerciseRow } from './ExerciseCommentPreviewItem';

/** «Фамилия Имя» пациента для второй строки шапки модалки упражнения. */
function patientHeaderName(item: TodayExerciseCommentAttentionItem): string {
  return formatDoctorFioShort(
    {
      lastName: item.patientLastName ?? null,
      firstName: item.patientFirstName ?? null,
      patronymic: null,
    },
    item.patientDisplayName,
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
            <ExerciseCommentExerciseRow
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
      {selectedItem ? (
        <DoctorProgramItemDiscussionDialog
          instanceId={selectedItem.instanceId}
          itemId={selectedItem.stageItemId}
          itemLabel={selectedItem.stageItemTitle}
          patientName={patientHeaderName(selectedItem)}
          patientUserId={selectedItem.patientUserId}
          open={discussionOpen}
          onOpenChange={(nextOpen) => {
            setDiscussionOpen(nextOpen);
          }}
          onMarkedRead={() => onMarkedRead(selectedItem)}
        />
      ) : null}
    </DoctorModal>
  );
}
