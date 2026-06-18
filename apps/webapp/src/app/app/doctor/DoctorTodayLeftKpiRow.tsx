"use client";

import Link from "next/link";
import { useState } from "react";
import { DoctorMetricList } from "@/shared/ui/doctor/DoctorMetricList";
import { KpiPreviewModal } from "@/shared/ui/doctor/KpiPreviewModal";
import { doctorInlineLinkClass, doctorSectionItemClass } from "@/shared/ui/doctor/doctorVisual";
import { DoctorStatCard } from "./analytics/clients/DoctorStatCard";
import type {
  TodayDashboardData,
  TodayIntakeItem,
  TodayUnreadConversationItem,
  TodayExerciseCommentAttentionItem,
} from "./loadDoctorTodayDashboard";
import type { TodayPendingProgramTestItem } from "./mapPendingProgramTestsForToday";
import { routePaths } from "@/app-layer/routes/paths";

type Props = Pick<
  TodayDashboardData,
  | "newIntakeRequests"
  | "unreadConversations"
  | "unreadTotal"
  | "pendingProgramTests"
  | "pendingProgramTestsTotal"
  | "exerciseCommentAttentionItems"
  | "exerciseCommentAttentionTotal"
  | "exerciseCommentAttentionTruncated"
> & {
  intakeCount: number;
  pendingTestsTotal: number;
  /**
   * SEG-07: Переопределяет локальный счётчик комментариев.
   * Управляется из DoctorTodayLeftPaneBridge (client) в DoctorTodayDashboard.tsx,
   * чтобы декремент из DoctorTodaySignalsSection синхронно обновлял KPI-тайл.
   */
  exerciseCommentsTotalOverride?: number;
};

type KpiModal = "messages" | "comments" | "intake" | "tests" | null;

function IntakeModalItem({ item }: { item: TodayIntakeItem }) {
  return (
    <div className={doctorSectionItemClass}>
      <p className="font-medium text-foreground">{item.patientName}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Тел.: {item.patientPhone}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {item.typeLabel} · {item.createdAtLabel}
      </p>
      {item.summaryPreview ? (
        <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
          {item.summaryPreview}
        </p>
      ) : null}
      <p className="mt-2">
        <Link href={item.href} className={doctorInlineLinkClass}>
          Открыть заявку
        </Link>
      </p>
    </div>
  );
}

function UnreadConversationModalItem({ item }: { item: TodayUnreadConversationItem }) {
  return (
    <div className={doctorSectionItemClass}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium text-foreground">{item.displayName}</p>
        <span className="shrink-0 text-xs text-muted-foreground">{item.lastMessageAtLabel}</span>
      </div>
      {item.lastMessagePreview ? (
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.lastMessagePreview}</p>
      ) : null}
      {item.unreadFromUserCount > 0 ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{item.unreadFromUserCount} непрочитанных</p>
      ) : null}
      <p className="mt-2">
        <Link href={routePaths.doctorCommunications} className={doctorInlineLinkClass}>
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
      <p className="mt-0.5 text-xs text-muted-foreground">{item.instanceTitle} · {item.stageTitle}</p>
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
    <div className={doctorSectionItemClass}>
      <p className="font-medium text-foreground">{item.patientDisplayName}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{item.stageItemTitle}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{item.latestMessageAtLabel}</p>
      <p className="mt-2">
        <Link href={item.href} className={doctorInlineLinkClass}>
          Открыть комментарии
        </Link>
      </p>
    </div>
  );
}

export function DoctorTodayLeftKpiRow({
  intakeCount,
  pendingTestsTotal,
  newIntakeRequests,
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
  // чтобы синхронизировать с декрементом из DoctorTodaySignalsSection.
  const [exerciseCommentItems] = useState(exerciseCommentAttentionItems);
  const displayTotal = exerciseCommentsTotalOverride ?? exerciseCommentAttentionTotal;

  return (
    <>
      <DoctorMetricList
        id="doctor-today-left-kpi"
        aria-label="Входящий поток"
        className="grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4"
      >
        {/* Сообщения → KpiPreviewModal (SEG-02) */}
        <DoctorStatCard
          id="doctor-today-left-kpi-messages"
          title="Сообщения"
          value={unreadTotal}
          tone={unreadTotal > 0 ? "warning" : "neutral"}
          onClick={() => setKpiModal("messages")}
        />
        {/* Комментарии к упражнениям → KpiPreviewModal (S2.8) */}
        <DoctorStatCard
          id="doctor-today-left-kpi-comments"
          title="Комментарии"
          value={displayTotal}
          tone={displayTotal > 0 ? "warning" : "neutral"}
          onClick={() => setKpiModal("comments")}
        />
        {/* Онлайн-заявки → KpiPreviewModal (S2.8) */}
        <DoctorStatCard
          id="doctor-today-left-kpi-intake"
          title="Заявки"
          value={intakeCount}
          tone={intakeCount > 0 ? "warning" : "neutral"}
          onClick={() => setKpiModal("intake")}
        />
        {/* Тесты к проверке → KpiPreviewModal (SEG-02) */}
        <DoctorStatCard
          id="doctor-today-left-kpi-tests"
          title="Тесты"
          value={pendingTestsTotal}
          tone={pendingTestsTotal > 0 ? "warning" : "neutral"}
          onClick={() => setKpiModal("tests")}
        />
      </DoctorMetricList>

      {/* KpiPreviewModal: Комментарии */}
      <KpiPreviewModal<TodayExerciseCommentAttentionItem>
        open={kpiModal === "comments"}
        onClose={() => setKpiModal(null)}
        title="Комментарии"
        count={displayTotal}
        items={exerciseCommentItems}
        renderItem={(item) => <ExerciseCommentModalItem item={item} />}
        searchPlaceholder="Поиск по пациенту…"
        searchPredicate={(item, q) =>
          item.patientDisplayName.toLowerCase().includes(q.toLowerCase()) ||
          item.stageItemTitle.toLowerCase().includes(q.toLowerCase())
        }
        emptyState={
          <p className="py-4 text-center text-sm text-muted-foreground">
            Нет новых комментариев по упражнениям
          </p>
        }
      />

      {/* KpiPreviewModal: Заявки */}
      <KpiPreviewModal<TodayIntakeItem>
        open={kpiModal === "intake"}
        onClose={() => setKpiModal(null)}
        title="Заявки"
        count={intakeCount}
        items={newIntakeRequests}
        renderItem={(item) => <IntakeModalItem item={item} />}
        searchPlaceholder="Поиск по пациенту…"
        searchPredicate={(item, q) =>
          item.patientName.toLowerCase().includes(q.toLowerCase()) ||
          item.patientPhone.toLowerCase().includes(q.toLowerCase())
        }
        emptyState={
          <p className="py-4 text-center text-sm text-muted-foreground">
            Новых заявок нет.{" "}
            <Link href="/app/doctor/online-intake" className={doctorInlineLinkClass}>
              Все заявки
            </Link>
          </p>
        }
      />

      {/* KpiPreviewModal: Сообщения (SEG-02) */}
      <KpiPreviewModal<TodayUnreadConversationItem>
        open={kpiModal === "messages"}
        onClose={() => setKpiModal(null)}
        title="Сообщения"
        count={unreadTotal}
        items={unreadConversations}
        renderItem={(item) => <UnreadConversationModalItem item={item} />}
        searchPlaceholder="Поиск по имени…"
        searchPredicate={(item, q) =>
          item.displayName.toLowerCase().includes(q.toLowerCase()) ||
          (item.phoneNormalized?.toLowerCase().includes(q.toLowerCase()) ?? false)
        }
        emptyState={
          <p className="py-4 text-center text-sm text-muted-foreground">
            Нет непрочитанных сообщений.{" "}
            <Link href={routePaths.doctorCommunications} className={doctorInlineLinkClass}>
              Открыть коммуникации
            </Link>
          </p>
        }
      />

      {/* KpiPreviewModal: Тесты к проверке (SEG-02) */}
      <KpiPreviewModal<TodayPendingProgramTestItem>
        open={kpiModal === "tests"}
        onClose={() => setKpiModal(null)}
        title="Тесты к проверке"
        count={pendingProgramTestsTotal}
        items={pendingProgramTests}
        renderItem={(item) => <PendingTestModalItem item={item} />}
        searchPlaceholder="Поиск по пациенту…"
        searchPredicate={(item, q) =>
          item.patientDisplayName.toLowerCase().includes(q.toLowerCase()) ||
          item.instanceTitle.toLowerCase().includes(q.toLowerCase())
        }
        emptyState={
          <p className="py-4 text-center text-sm text-muted-foreground">
            Нет тестов, ожидающих проверки
          </p>
        }
      />
    </>
  );
}
