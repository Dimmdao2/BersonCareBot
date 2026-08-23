'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DoctorMetricList } from '@/shared/ui/doctor/DoctorMetricList';
import { KpiPreviewModal } from '@/shared/ui/doctor/KpiPreviewModal';
import { doctorInlineLinkClass, doctorSectionItemClass } from '@/shared/ui/doctor/doctorVisual';
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
import { useViewportMinWidth } from '@/shared/hooks/useViewportMinWidth';

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

const todayKpiCardClass =
  'flex flex-row items-center justify-between gap-2 md:flex-col md:items-start [&>p]:text-foreground/75 [&>div]:mt-0 md:[&>div]:mt-0.5';

function UnreadConversationModalItem({ item }: { item: TodayUnreadConversationItem }) {
  return (
    <div className={doctorSectionItemClass}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium text-foreground">{item.displayName}</p>
        <span className="shrink-0 text-xs text-muted-foreground">{item.lastMessageAtLabel}</span>
      </div>
      {item.lastMessagePreview ? (
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {item.lastMessagePreview}
        </p>
      ) : null}
      {item.unreadFromUserCount > 0 ? (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {item.unreadFromUserCount} непрочитанных
        </p>
      ) : null}
      <p className="mt-2">
        {/* #812: deep-link to this exact dialog, not just the chats tab */}
        <Link href={item.href} className={doctorInlineLinkClass}>
          Открыть переписку
        </Link>
      </p>
    </div>
  );
}

function PendingTestModalItem({ item }: { item: TodayPendingProgramTestItem }) {
  return (
    <div className={doctorSectionItemClass}>
      <p className="font-medium text-foreground">{item.patientDisplayName}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {item.instanceTitle} · {item.stageTitle}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{item.submittedAtLabel}</p>
      <p className="mt-2">
        <Link href={item.href} className={doctorInlineLinkClass}>
          Проверить тест
        </Link>
      </p>
    </div>
  );
}

function ExerciseCommentModalItem({ item }: { item: TodayExerciseCommentAttentionItem }) {
  return (
    <Link
      href={item.href}
      className={`${doctorSectionItemClass} block transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40`}
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
          onClick={unreadTotal > 0 ? () => setKpiModal('messages') : undefined}
          className={todayKpiCardClass}
        />
        {/* Комментарии к упражнениям → KpiPreviewModal (S2.8) */}
        <DoctorStatCard
          id="doctor-today-left-kpi-comments"
          title="Комментарии"
          value={displayTotal}
          tooltip="Новые комментарии клиентов к упражнениям."
          tone={displayTotal > 0 ? 'warning' : 'neutral'}
          onClick={displayTotal > 0 ? () => setKpiModal('comments') : undefined}
          className={todayKpiCardClass}
        />
        {/* Тесты к проверке → KpiPreviewModal (SEG-02) */}
        <DoctorStatCard
          id="doctor-today-left-kpi-tests"
          title="Тесты"
          value={pendingTestsTotal}
          tooltip="Тесты по программам, ожидающие проверки."
          tone={pendingTestsTotal > 0 ? 'warning' : 'neutral'}
          onClick={pendingTestsTotal > 0 ? () => setKpiModal('tests') : undefined}
          className={todayKpiCardClass}
        />
        {tasksReadable ? (
          <DoctorStatCard
            id="doctor-today-left-kpi-tasks"
            title="Задачи"
            value={
              attentionTasks.length > 0 ? (
                <span className="flex w-full items-baseline justify-between gap-3">
                  <span className="text-destructive">{attentionTasks.length}</span>
                  <span className="text-base text-foreground/75">{tasksTotal}</span>
                </span>
              ) : (
                <span className="text-foreground/75">{tasksTotal}</span>
              )
            }
            tooltip="Открытые задачи."
            tone={attentionTasks.length > 0 ? 'warning' : 'neutral'}
            onClick={() => {
              if (isDesktopViewport) {
                router.push(routePaths.doctorTasks);
                return;
              }
              setKpiModal('tasks');
            }}
            className={todayKpiCardClass}
            valueClassName={attentionTasks.length > 0 ? 'w-full' : undefined}
          />
        ) : null}
      </DoctorMetricList>

      {/* KpiPreviewModal: Комментарии */}
      <KpiPreviewModal<TodayExerciseCommentAttentionItem>
        open={kpiModal === 'comments'}
        onClose={() => setKpiModal(null)}
        title="Комментарии"
        count={displayTotal}
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
        title="Задачи"
        count={attentionTasks.length}
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
    </>
  );
}
