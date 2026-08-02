'use client';

import Link from 'next/link';
import { useState } from 'react';
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
};

type KpiModal = 'messages' | 'comments' | 'tests' | null;

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
}: Props) {
  const [kpiModal, setKpiModal] = useState<KpiModal>(null);
  // SEG-07: items сохраняем локально (список в KpiPreviewModal);
  // total берётся из exerciseCommentsTotalOverride, управляемого DoctorTodayDashboard,
  // чтобы синхронизировать с обработкой комментария в диалоге.
  const [exerciseCommentItems] = useState(exerciseCommentAttentionItems);
  const displayTotal = exerciseCommentsTotalOverride ?? exerciseCommentAttentionTotal;

  return (
    <>
      <DoctorMetricList
        id="doctor-today-left-kpi"
        aria-label="Входящий поток"
        className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-3"
      >
        {/* Сообщения → KpiPreviewModal (SEG-02) */}
        <DoctorStatCard
          id="doctor-today-left-kpi-messages"
          title="Сообщения"
          value={unreadTotal}
          tooltip="Непрочитанные сообщения от клиентов."
          tone={unreadTotal > 0 ? 'warning' : 'neutral'}
          onClick={unreadTotal > 0 ? () => setKpiModal('messages') : undefined}
        />
        {/* Комментарии к упражнениям → KpiPreviewModal (S2.8) */}
        <DoctorStatCard
          id="doctor-today-left-kpi-comments"
          title="Комментарии"
          value={displayTotal}
          tooltip="Новые комментарии клиентов к упражнениям."
          tone={displayTotal > 0 ? 'warning' : 'neutral'}
          onClick={displayTotal > 0 ? () => setKpiModal('comments') : undefined}
        />
        {/* Тесты к проверке → KpiPreviewModal (SEG-02) */}
        <DoctorStatCard
          id="doctor-today-left-kpi-tests"
          title="Тесты"
          value={pendingTestsTotal}
          tooltip="Тесты по программам, ожидающие проверки."
          tone={pendingTestsTotal > 0 ? 'warning' : 'neutral'}
          onClick={pendingTestsTotal > 0 ? () => setKpiModal('tests') : undefined}
        />
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
    </>
  );
}
