'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StickyNotePlus } from 'lucide-react';
import { DoctorMetricList } from '@/shared/ui/doctor/DoctorMetricList';
import { KpiPreviewModal } from '@/shared/ui/doctor/KpiPreviewModal';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { doctorInlineLinkClass } from '@/shared/ui/doctor/doctorVisual';
import {
  doctorDnaFlatListClickableClass,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { DoctorStatCard } from './analytics/clients/DoctorStatCard';
import { ExerciseCommentPreviewItemContent } from './comments/ExerciseCommentPreviewItem';
import type {
  TodayDashboardData,
  TodayUnreadConversationItem,
  TodayExerciseCommentAttentionItem,
} from './loadDoctorTodayDashboard';
import type { TodayPendingProgramTestItem } from './mapPendingProgramTestsForToday';
import { routePaths } from '@/app-layer/routes/paths';
import type { SpecialistTaskRow } from '@/modules/specialist-tasks/types';
import {
  isSpecialistTaskDueOnDate,
  isSpecialistTaskOverdue,
} from '@/modules/specialist-tasks/taskPriority';
import { SpecialistTaskRow as TaskRow } from './clients/SpecialistTaskRow';
import { SpecialistTaskDetailsDialog } from './clients/SpecialistTaskDetailsDialog';
import { SpecialistTaskFormDialog } from './clients/SpecialistTaskFormDialog';
import { useViewportMinWidth } from '@/shared/hooks/useViewportMinWidth';
import { DOCTOR_MOBILE_HEADER_ICON_ACTION_CLASS } from '@/shared/ui/doctor/navChrome';

type Props = Pick<
  TodayDashboardData,
  | 'unreadConversations'
  | 'unreadTotal'
  | 'pendingProgramTests'
  | 'pendingProgramTestsTotal'
  | 'exerciseCommentAttentionItems'
  | 'exerciseCommentAttentionTotal'
  | 'exerciseCommentAttentionTruncated'
> & {
  pendingTestsTotal: number;
  /**
   * SEG-07: Переопределяет локальный счётчик комментариев.
   * Управляется из DoctorTodayLeftPaneBridge (client) в DoctorTodayDashboard.tsx,
   * чтобы обработка комментария синхронно обновляла KPI-тайл.
   */
  exerciseCommentsTotalOverride?: number;
  tasks: SpecialistTaskRow[];
  taskPatientNames: Record<string, string>;
  tasksTotal: number;
  todayIso: string;
  displayIana: string;
  tasksAvailable: boolean;
  tasksReadable: boolean;
  taskMutationPending: boolean;
  onTaskComplete: (taskId: string) => Promise<boolean>;
  onTaskSaved: (task: SpecialistTaskRow, patientDisplayName?: string) => void;
};

type KpiModal = 'messages' | 'comments' | 'tests' | 'tasks' | null;

const attentionKpiBackgroundClass = 'bg-[#f5ede5]';
const attentionKpiValueClass = 'text-destructive';

function UnreadConversationModalItem({ item }: { item: TodayUnreadConversationItem }) {
  return (
    <Link
      href={item.href}
      className={`${doctorDnaFlatListRowClass} ${doctorDnaFlatListClickableClass} block`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className={doctorDnaFlatListPrimaryClass}>{item.displayName}</p>
        <span className={`${doctorDnaFlatListMetaClass} shrink-0`}>{item.lastMessageAtLabel}</span>
      </div>
      {item.lastMessagePreview ? (
        <p className={`${doctorDnaFlatListMetaClass} mt-0.5 line-clamp-2`}>
          {item.lastMessagePreview}
        </p>
      ) : null}
      {item.unreadFromUserCount > 0 ? (
        <p className={`${doctorDnaFlatListMetaClass} mt-0.5`}>
          {item.unreadFromUserCount} непрочитанных
        </p>
      ) : null}
    </Link>
  );
}

function PendingTestModalItem({ item }: { item: TodayPendingProgramTestItem }) {
  return (
    <Link
      href={item.href}
      className={`${doctorDnaFlatListRowClass} ${doctorDnaFlatListClickableClass} block`}
    >
      <p className={doctorDnaFlatListPrimaryClass}>{item.patientDisplayName}</p>
      <p className={`${doctorDnaFlatListMetaClass} mt-0.5`}>
        {item.instanceTitle} · {item.stageTitle}
      </p>
      <p className={`${doctorDnaFlatListMetaClass} mt-0.5`}>{item.submittedAtLabel}</p>
    </Link>
  );
}

function ExerciseCommentModalItem({ item }: { item: TodayExerciseCommentAttentionItem }) {
  return (
    <Link
      href={item.href}
      className={`${doctorDnaFlatListRowClass} ${doctorDnaFlatListClickableClass} block`}
    >
      <ExerciseCommentPreviewItemContent item={item} />
    </Link>
  );
}

export function DoctorTodayLeftKpiRow({
  pendingTestsTotal,
  unreadConversations,
  unreadTotal,
  pendingProgramTests,
  pendingProgramTestsTotal,
  exerciseCommentAttentionItems,
  exerciseCommentAttentionTotal,
  exerciseCommentsTotalOverride,
  tasks,
  taskPatientNames,
  tasksTotal,
  todayIso,
  displayIana,
  tasksAvailable,
  tasksReadable,
  taskMutationPending,
  onTaskComplete,
  onTaskSaved,
}: Props) {
  const [kpiModal, setKpiModal] = useState<KpiModal>(null);
  const router = useRouter();
  // DoctorTodayDashboard switches to its two-column desktop workspace at `md` (768px).
  // Keep KPI navigation on the same boundary so tablet widths do not open the mobile modal.
  const isDesktopViewport = useViewportMinWidth(768);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  // SEG-07: items сохраняем локально (список в KpiPreviewModal);
  // total берётся из exerciseCommentsTotalOverride, управляемого DoctorTodayDashboard,
  // чтобы синхронизировать с обработкой комментария в диалоге.
  const [exerciseCommentItems] = useState(exerciseCommentAttentionItems);
  const displayTotal = exerciseCommentsTotalOverride ?? exerciseCommentAttentionTotal;
  const attentionTasks = tasks
    .filter(
      (task) =>
        isSpecialistTaskOverdue(task) || isSpecialistTaskDueOnDate(task, todayIso, displayIana),
    )
    .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
  const selectedTask = selectedTaskId
    ? (tasks.find((task) => task.id === selectedTaskId) ?? null)
    : null;

  return (
    <>
      <DoctorMetricList
        id="doctor-today-left-kpi"
        aria-label="Входящий поток"
        className="grid-cols-2 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4"
      >
        {/* Сообщения → KpiPreviewModal (SEG-02) */}
        <DoctorStatCard
          id="doctor-today-left-kpi-messages"
          title="Сообщения"
          value={unreadTotal}
          tooltip="Непрочитанные сообщения от клиентов."
          tone={unreadTotal > 0 ? 'warning' : 'neutral'}
          className={unreadTotal > 0 ? attentionKpiBackgroundClass : undefined}
          valueClassName={unreadTotal > 0 ? attentionKpiValueClass : undefined}
          onClick={unreadTotal > 0 ? () => setKpiModal('messages') : undefined}
        />
        {/* Комментарии к упражнениям → KpiPreviewModal (S2.8) */}
        <DoctorStatCard
          id="doctor-today-left-kpi-comments"
          title="Комментарии"
          value={displayTotal}
          tooltip="Новые комментарии клиентов к упражнениям."
          tone={displayTotal > 0 ? 'warning' : 'neutral'}
          className={displayTotal > 0 ? attentionKpiBackgroundClass : undefined}
          valueClassName={displayTotal > 0 ? attentionKpiValueClass : undefined}
          onClick={displayTotal > 0 ? () => setKpiModal('comments') : undefined}
        />
        {/* Тесты к проверке → KpiPreviewModal (SEG-02) */}
        <DoctorStatCard
          id="doctor-today-left-kpi-tests"
          title="Тесты"
          value={pendingTestsTotal}
          tooltip="Тесты по программам, ожидающие проверки."
          tone={pendingTestsTotal > 0 ? 'warning' : 'neutral'}
          className={pendingTestsTotal > 0 ? attentionKpiBackgroundClass : undefined}
          valueClassName={pendingTestsTotal > 0 ? attentionKpiValueClass : undefined}
          onClick={pendingTestsTotal > 0 ? () => setKpiModal('tests') : undefined}
        />
        {tasksReadable ? (
          <DoctorStatCard
            id="doctor-today-left-kpi-tasks"
            title="Задачи"
            value={attentionTasks.length > 0 ? attentionTasks.length : tasksTotal}
            secondaryValue={attentionTasks.length > 0 ? tasksTotal : undefined}
            tooltip="Открытые задачи."
            tone={attentionTasks.length > 0 ? 'warning' : 'neutral'}
            className={attentionTasks.length > 0 ? attentionKpiBackgroundClass : undefined}
            onClick={
              (attentionTasks.length > 0 ? attentionTasks.length : tasksTotal) > 0
                ? () => {
                    if (isDesktopViewport) {
                      router.push(routePaths.doctorTasks);
                      return;
                    }
                    setKpiModal('tasks');
                  }
                : undefined
            }
            valueClassName={
              attentionTasks.length > 0 ? attentionKpiValueClass : 'text-foreground/75'
            }
          />
        ) : null}
      </DoctorMetricList>

      {/* KpiPreviewModal: Комментарии */}
      <KpiPreviewModal<TodayExerciseCommentAttentionItem>
        open={kpiModal === 'comments'}
        onClose={() => setKpiModal(null)}
        title="Комментарии"
        count={displayTotal}
        showCount={false}
        desktopPresentation="right-sheet"
        items={exerciseCommentItems}
        renderItem={(item) => <ExerciseCommentModalItem item={item} />}
        emptyState={
          <p className="py-4 text-center text-sm text-muted-foreground">
            Нет новых комментариев по упражнениям
          </p>
        }
      />

      {/* KpiPreviewModal: Сообщения (SEG-02) */}
      <KpiPreviewModal<TodayUnreadConversationItem>
        open={kpiModal === 'messages'}
        onClose={() => setKpiModal(null)}
        title="Сообщения"
        count={unreadTotal}
        showCount={false}
        desktopPresentation="right-sheet"
        items={unreadConversations}
        renderItem={(item) => <UnreadConversationModalItem item={item} />}
        emptyState={
          <p className="py-4 text-center text-sm text-muted-foreground">
            Нет непрочитанных сообщений.{' '}
            <Link href={routePaths.doctorCommunications} className={doctorInlineLinkClass}>
              Открыть коммуникации
            </Link>
          </p>
        }
      />

      {/* KpiPreviewModal: Тесты к проверке (SEG-02) */}
      <KpiPreviewModal<TodayPendingProgramTestItem>
        open={kpiModal === 'tests'}
        onClose={() => setKpiModal(null)}
        title="Тесты к проверке"
        count={pendingProgramTestsTotal}
        showCount={false}
        desktopPresentation="right-sheet"
        items={pendingProgramTests}
        renderItem={(item) => <PendingTestModalItem item={item} />}
        emptyState={
          <p className="py-4 text-center text-sm text-muted-foreground">
            Нет тестов, ожидающих проверки
          </p>
        }
      />

      <KpiPreviewModal<SpecialistTaskRow>
        open={kpiModal === 'tasks'}
        onClose={() => setKpiModal(null)}
        title="Задачи на сегодня"
        count={attentionTasks.length}
        showCount={false}
        desktopPresentation="right-sheet"
        headerAction={
          tasksAvailable ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={DOCTOR_MOBILE_HEADER_ICON_ACTION_CLASS}
              aria-label="Новая задача"
              title="Новая задача"
              onClick={() => setTaskCreateOpen(true)}
            >
              <StickyNotePlus className="size-[22px]" aria-hidden />
            </Button>
          ) : undefined
        }
        items={attentionTasks}
        renderItem={(task) => (
          <TaskRow
            as="div"
            task={task}
            displayIana={displayIana}
            patientDisplayName={
              task.patientUserId ? taskPatientNames[task.patientUserId] : undefined
            }
            dueToday={isSpecialistTaskDueOnDate(task, todayIso, displayIana)}
            canMutate={tasksAvailable}
            onOpen={(selected) => {
              setKpiModal(null);
              setSelectedTaskId(selected.id);
            }}
          />
        )}
        emptyState={
          <p className="py-4 text-center text-sm text-muted-foreground">
            Нет задач на сегодня или просроченных
          </p>
        }
      />

      <SpecialistTaskDetailsDialog
        open={selectedTask != null}
        onClose={() => setSelectedTaskId(null)}
        task={selectedTask}
        patientDisplayName={
          selectedTask?.patientUserId ? taskPatientNames[selectedTask.patientUserId] : undefined
        }
        displayIana={displayIana}
        canMutate={tasksAvailable}
        busy={taskMutationPending}
        onComplete={onTaskComplete}
        onTaskSaved={onTaskSaved}
      />
      {tasksAvailable ? (
        <SpecialistTaskFormDialog
          open={taskCreateOpen}
          onOpenChange={setTaskCreateOpen}
          patientUserId=""
          editing={null}
          onSaved={(task, patientDisplayName) => {
            onTaskSaved(task, patientDisplayName);
            setTaskCreateOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
