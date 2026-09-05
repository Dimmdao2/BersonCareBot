'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DoctorMetricList } from '@/shared/ui/doctor/DoctorMetricList';
import { KpiPreviewModal } from '@/shared/ui/doctor/KpiPreviewModal';
import { Button, buttonVariants } from '@/shared/ui/doctor/primitives/button';
import { DoctorConversationListRow } from '@/modules/messaging/components/DoctorConversationListRow';
import { DoctorConversationChatModal } from '@/modules/messaging/components/DoctorConversationChatModal';
import {
  doctorDnaFlatListClickableClass,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { DoctorStatCard } from './analytics/clients/DoctorStatCard';
import { DoctorTodayExerciseCommentsModal } from './comments/DoctorTodayExerciseCommentsModal';
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
  selectSpecialistTasksDueTodayOrOverdue,
} from '@/modules/specialist-tasks/taskPriority';
import { SpecialistTaskRow as TaskRow } from './clients/SpecialistTaskRow';
import { SpecialistTaskDetailsDialog } from './clients/SpecialistTaskDetailsDialog';
import { SpecialistTaskFormDialog } from './clients/SpecialistTaskFormDialog';
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
  taskPatientOnSupport: Record<string, boolean>;
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

function UnreadConversationModalItem({
  item,
  onOpen,
}: {
  item: TodayUnreadConversationItem;
  onOpen: () => void;
}) {
  return (
    <DoctorConversationListRow
      conversation={{
        conversationId: item.conversationId,
        displayName: item.displayName,
        firstName: item.firstName,
        lastName: item.lastName,
        lastMessageAt: item.lastMessageAt,
        lastMessageText: item.lastMessageText,
        lastSenderRole: item.lastSenderRole,
        unreadFromUserCount: item.unreadFromUserCount,
        onSupport: item.onSupport,
      }}
      onClick={onOpen}
      variant="unread-preview"
    />
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
  taskPatientOnSupport,
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
  const [selectedConversation, setSelectedConversation] =
    useState<TodayUnreadConversationItem | null>(null);
  const [locallyReadConversationIds, setLocallyReadConversationIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const router = useRouter();
  // DoctorTodayDashboard switches to its two-column desktop workspace at `md` (768px).
  // Keep KPI navigation on the same boundary so tablet widths do not open the mobile modal.
  const isDesktopViewport = useViewportMinWidth(768);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [locallyReadCommentKeys, setLocallyReadCommentKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const messageItems = unreadConversations.filter(
    (item) => !locallyReadConversationIds.has(item.conversationId),
  );
  const locallyReadMessageCount = unreadConversations.reduce(
    (total, item) =>
      locallyReadConversationIds.has(item.conversationId)
        ? total + item.unreadFromUserCount
        : total,
    0,
  );
  const messageTotal = Math.max(0, unreadTotal - locallyReadMessageCount);
  const exerciseCommentItems = exerciseCommentAttentionItems.filter(
    (item) => !locallyReadCommentKeys.has(`${item.instanceId}:${item.stageItemId}`),
  );
  const locallyReadCommentCount = exerciseCommentAttentionItems.reduce(
    (total, item) =>
      locallyReadCommentKeys.has(`${item.instanceId}:${item.stageItemId}`)
        ? total + (item.unreadCount ?? 1)
        : total,
    0,
  );
  const displayTotal = Math.max(
    0,
    (exerciseCommentsTotalOverride ?? exerciseCommentAttentionTotal) - locallyReadCommentCount,
  );
  const attentionTasks = selectSpecialistTasksDueTodayOrOverdue(tasks, todayIso, displayIana);
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
          value={messageTotal}
          tooltip="Непрочитанные сообщения от клиентов."
          tone={messageTotal > 0 ? 'warning' : 'neutral'}
          className={messageTotal > 0 ? attentionKpiBackgroundClass : undefined}
          valueClassName={messageTotal > 0 ? attentionKpiValueClass : undefined}
          onClick={messageTotal > 0 ? () => setKpiModal('messages') : undefined}
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
            valueClassName={attentionTasks.length > 0 ? attentionKpiValueClass : undefined}
          />
        ) : null}
      </DoctorMetricList>

      <DoctorTodayExerciseCommentsModal
        open={kpiModal === 'comments'}
        onClose={() => setKpiModal(null)}
        items={exerciseCommentItems}
        onMarkedRead={(item) => {
          setLocallyReadCommentKeys((current) => {
            const next = new Set(current);
            next.add(`${item.instanceId}:${item.stageItemId}`);
            return next;
          });
          router.refresh();
        }}
      />

      {/* KpiPreviewModal: Сообщения (SEG-02) */}
      <KpiPreviewModal<TodayUnreadConversationItem>
        open={kpiModal === 'messages'}
        onClose={() => {
          setSelectedConversation(null);
          setKpiModal(null);
        }}
        title="Сообщения"
        count={messageTotal}
        showCount={false}
        desktopPresentation="right-sheet"
        nestedModals={
          <DoctorConversationChatModal
            conversationId={selectedConversation?.conversationId ?? null}
            displayName={
              selectedConversation
                ? [selectedConversation.lastName, selectedConversation.firstName]
                    .filter(Boolean)
                    .join(' ') || selectedConversation.displayName
                : ''
            }
            patientUserId={selectedConversation?.patientUserId ?? null}
            patientOnSupport={selectedConversation?.onSupport === true}
            onClose={() => setSelectedConversation(null)}
            onReadStateChanged={() => {
              if (!selectedConversation) return;
              const readConversationId = selectedConversation.conversationId;
              setLocallyReadConversationIds((current) => {
                const next = new Set(current);
                next.add(readConversationId);
                return next;
              });
              router.refresh();
            }}
          />
        }
        items={messageItems}
        renderItem={(item) => (
          <li>
            <UnreadConversationModalItem item={item} onOpen={() => setSelectedConversation(item)} />
          </li>
        )}
        emptyState={
          <p className="py-4 text-center text-sm text-muted-foreground">
            Нет непрочитанных сообщений
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
        renderItem={(item) => (
          <li>
            <PendingTestModalItem item={item} />
          </li>
        )}
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
        items={attentionTasks}
        nestedModals={
          <>
            <SpecialistTaskFormDialog
              open={taskFormOpen}
              onOpenChange={setTaskFormOpen}
              patientUserId=""
              editing={null}
              onSaved={onTaskSaved}
            />
            <SpecialistTaskDetailsDialog
              open={selectedTask != null}
              onClose={() => setSelectedTaskId(null)}
              task={selectedTask}
              patientDisplayName={
                selectedTask?.patientUserId
                  ? taskPatientNames[selectedTask.patientUserId]
                  : undefined
              }
              patientOnSupport={
                selectedTask?.patientUserId
                  ? taskPatientOnSupport[selectedTask.patientUserId] === true
                  : false
              }
              displayIana={displayIana}
              canMutate={tasksAvailable}
              busy={taskMutationPending}
              onComplete={onTaskComplete}
              onTaskSaved={onTaskSaved}
            />
          </>
        }
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <Link
              href={routePaths.doctorTasks}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
              onClick={() => setKpiModal(null)}
            >
              Все задачи
            </Link>
            {tasksAvailable ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setTaskFormOpen(true);
                }}
              >
                Новая задача
              </Button>
            ) : null}
          </div>
        }
        renderItem={(task) => (
          <li>
            <TaskRow
              as="div"
              task={task}
              displayIana={displayIana}
              patientDisplayName={
                task.patientUserId ? taskPatientNames[task.patientUserId] : undefined
              }
              patientOnSupport={
                task.patientUserId ? taskPatientOnSupport[task.patientUserId] === true : false
              }
              dueToday={isSpecialistTaskDueOnDate(task, todayIso, displayIana)}
              canMutate={tasksAvailable}
              mobileFlat
              onOpen={(selected) => {
                setSelectedTaskId(selected.id);
              }}
            />
          </li>
        )}
        emptyState={
          <p className="py-4 text-center text-sm text-muted-foreground">
            Нет задач на сегодня или просроченных
          </p>
        }
      />
    </>
  );
}
