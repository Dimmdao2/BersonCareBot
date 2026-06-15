"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { DoctorMetricList } from "@/shared/ui/doctor/DoctorMetricList";
import { KpiPreviewModal } from "@/shared/ui/doctor/KpiPreviewModal";
import { doctorInlineLinkClass, doctorSectionItemClass } from "@/shared/ui/doctor/doctorVisual";
import { DoctorStatCard } from "./analytics/clients/DoctorStatCard";
import {
  DoctorTodayAttentionDialog,
  type DoctorTodayAttentionKind,
} from "./DoctorTodayAttentionDialog";
import type { TodayDashboardData, TodayIntakeItem, TodayExerciseCommentAttentionItem } from "./loadDoctorTodayDashboard";
import { routePaths } from "@/app-layer/routes/paths";

type Props = Pick<
  TodayDashboardData,
  | "newIntakeRequests"
  | "unreadConversations"
  | "unreadTotal"
  | "pendingProgramTests"
  | "pendingProgramTestsTotal"
  | "pendingProgramTestsTruncated"
  | "proactiveInsights"
  | "proactiveInsightsTotal"
  | "proactiveInsightsTruncated"
  | "exerciseCommentAttentionItems"
  | "exerciseCommentAttentionTotal"
  | "exerciseCommentAttentionTruncated"
> & {
  intakeCount: number;
  pendingTestsTotal: number;
};

type KpiModal = "comments" | "intake" | null;

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
  pendingProgramTestsTruncated,
  proactiveInsights,
  proactiveInsightsTotal,
  proactiveInsightsTruncated,
  exerciseCommentAttentionItems,
  exerciseCommentAttentionTotal,
  exerciseCommentAttentionTruncated,
}: Props) {
  const [dialogKind, setDialogKind] = useState<DoctorTodayAttentionKind | null>(null);
  const [kpiModal, setKpiModal] = useState<KpiModal>(null);
  const [exerciseCommentsState, setExerciseCommentsState] = useState({
    items: exerciseCommentAttentionItems,
    total: exerciseCommentAttentionTotal,
    truncated: exerciseCommentAttentionTruncated,
  });

  const openDialog = useCallback((kind: DoctorTodayAttentionKind) => {
    setDialogKind(kind);
  }, []);

  return (
    <>
      <DoctorMetricList
        id="doctor-today-left-kpi"
        aria-label="Входящий поток"
        className="grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4"
      >
        {/* Сообщения → прямая ссылка на коммуникации */}
        <DoctorStatCard
          id="doctor-today-left-kpi-messages"
          title="Сообщения"
          value={unreadTotal}
          tone={unreadTotal > 0 ? "warning" : "neutral"}
          href={routePaths.doctorCommunications}
        />
        {/* Комментарии к упражнениям → KpiPreviewModal (S2.8) */}
        <DoctorStatCard
          id="doctor-today-left-kpi-comments"
          title="Комментарии"
          value={exerciseCommentsState.total}
          tone={exerciseCommentsState.total > 0 ? "warning" : "neutral"}
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
        {/* Тесты к проверке → legacy AttentionDialog (unchanged) */}
        <DoctorStatCard
          id="doctor-today-left-kpi-tests"
          title="Тесты"
          value={pendingTestsTotal}
          tone={pendingTestsTotal > 0 ? "warning" : "neutral"}
          onClick={() => openDialog("pendingTests")}
        />
      </DoctorMetricList>

      {/* KpiPreviewModal: Комментарии */}
      <KpiPreviewModal<TodayExerciseCommentAttentionItem>
        open={kpiModal === "comments"}
        onClose={() => setKpiModal(null)}
        title="Комментарии"
        count={exerciseCommentsState.total}
        items={exerciseCommentsState.items}
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

      {/* Legacy AttentionDialog: kept for Тесты */}
      <DoctorTodayAttentionDialog
        open={dialogKind !== null}
        onOpenChange={(open) => {
          if (!open) setDialogKind(null);
        }}
        kind={dialogKind}
        newIntakeRequests={newIntakeRequests}
        unreadConversations={unreadConversations}
        unreadTotal={unreadTotal}
        pendingProgramTests={pendingProgramTests}
        pendingProgramTestsTotal={pendingProgramTestsTotal}
        pendingProgramTestsTruncated={pendingProgramTestsTruncated}
        proactiveInsights={proactiveInsights}
        proactiveInsightsTotal={proactiveInsightsTotal}
        proactiveInsightsTruncated={proactiveInsightsTruncated}
        exerciseCommentAttentionItems={exerciseCommentsState.items}
        exerciseCommentAttentionTotal={exerciseCommentsState.total}
        exerciseCommentAttentionTruncated={exerciseCommentsState.truncated}
        onExerciseCommentResolved={(stageItemId) => {
          setExerciseCommentsState((prev) => {
            const nextItems = prev.items.filter((item) => item.stageItemId !== stageItemId);
            const removed = nextItems.length === prev.items.length ? 0 : 1;
            const nextTotal = Math.max(0, prev.total - removed);
            return {
              items: nextItems,
              total: nextTotal,
              truncated: nextTotal > nextItems.length,
            };
          });
        }}
      />
    </>
  );
}
