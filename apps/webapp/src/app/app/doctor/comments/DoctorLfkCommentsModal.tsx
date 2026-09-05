'use client';

import { useState } from 'react';
import { DoctorModal, DoctorModalStackedTitle } from '@/shared/ui/doctor/DoctorModal';
import { DoctorDnaFlatList } from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { DoctorProgramItemDiscussionDialog } from '@/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/DoctorProgramItemDiscussionDialog';
import { patientCardHref } from '@/app/app/doctor/patients/patientCardHref';
import type { TodayExerciseCommentAttentionItem } from '../loadDoctorExerciseCommentAttention';
import { ExerciseCommentExerciseRow } from './ExerciseCommentPreviewItem';
import { useDoctorLfkComments } from './useDoctorLfkComments';

/**
 * «Комментарии к ЛФК» — единственная модалка комментариев по программе пациента.
 *
 * Открывается из карточки пациента (вкладка ЛФК) и со страницы «Комментарии» нижнего меню.
 * Заголовок: тип модалки + синее «Фамилия Имя» справа, название этапа — строкой ниже.
 * Тело: только упражнения, где есть хотя бы одно сообщение; строка — общая с KPI «Сегодня».
 * Тап по строке открывает ту же единую модалку упражнения (видео, статистика, рекомендации,
 * чат) вторым слоем: она выезжает снизу и не добавляет второго затемнения.
 */
export function DoctorLfkCommentsModal({
  open,
  onClose,
  patientUserId,
  patientName,
  patientOnSupport = false,
  stageTitle,
  onUnreadCleared,
}: {
  open: boolean;
  onClose: () => void;
  patientUserId: string | null;
  /** «Фамилия Имя» пациента — синяя правая часть шапки. */
  patientName: string;
  patientOnSupport?: boolean;
  /** Название этапа под шапкой; без него берётся активный этап загруженной программы. */
  stageTitle?: string | null;
  /** Тред прочитан: даёт вызывающему погасить его непрочитанные в своих счётчиках. */
  onUnreadCleared?: (input: { stageItemId: string; unreadCount: number }) => void;
}) {
  const { items, activeStageTitle, loading, error, markItemRead } = useDoctorLfkComments({
    open,
    patientUserId,
    patientDisplayName: patientName,
  });
  const [selectedItem, setSelectedItem] = useState<TodayExerciseCommentAttentionItem | null>(null);
  const [discussionOpen, setDiscussionOpen] = useState(false);

  // Смена состояния «открыта / закрыта» сбрасывает выбранное упражнение прямо в рендере:
  // иначе повторное открытие того же пациента сразу показало бы прошлый вложенный слой.
  const [openSession, setOpenSession] = useState(open);
  if (openSession !== open) {
    setOpenSession(open);
    if (discussionOpen) setDiscussionOpen(false);
    if (selectedItem) setSelectedItem(null);
  }

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
      title={
        <DoctorModalStackedTitle
          label="Комментарии к ЛФК"
          entity={stageTitle ?? activeStageTitle ?? undefined}
          patientName={patientName}
          patientHref={patientUserId ? patientCardHref(patientUserId) : null}
          patientOnSupport={patientOnSupport}
        />
      }
      size="lg"
      bodyVariant="list"
      desktopPresentation="right-sheet"
    >
      {loading ? (
        <DoctorPanelLoading className="py-10" />
      ) : error ? (
        <DoctorEmptyState size="xs" className="py-10 text-center text-destructive">
          {error}
        </DoctorEmptyState>
      ) : items.length === 0 ? (
        <DoctorEmptyState size="xs" className="py-10 text-center">
          Нет упражнений с комментариями
        </DoctorEmptyState>
      ) : (
        <DoctorDnaFlatList>
          {items.map((item) => (
            <ExerciseCommentExerciseRow
              key={`${item.instanceId}:${item.stageItemId}`}
              item={item}
              onOpen={() => openDiscussion(item)}
            />
          ))}
        </DoctorDnaFlatList>
      )}
      {selectedItem ? (
        <DoctorProgramItemDiscussionDialog
          instanceId={selectedItem.instanceId}
          itemId={selectedItem.stageItemId}
          itemLabel={selectedItem.stageItemTitle}
          patientName={patientName}
          patientUserId={patientUserId}
          patientOnSupport={patientOnSupport}
          open={discussionOpen}
          onOpenChange={setDiscussionOpen}
          onMarkedRead={() => {
            markItemRead(selectedItem.stageItemId);
            onUnreadCleared?.({
              stageItemId: selectedItem.stageItemId,
              unreadCount: selectedItem.unreadCount ?? 0,
            });
          }}
        />
      ) : null}
    </DoctorModal>
  );
}
