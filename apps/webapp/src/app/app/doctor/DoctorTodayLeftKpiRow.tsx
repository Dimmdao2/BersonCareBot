"use client";

import { useCallback, useState } from "react";
import { DoctorMetricList } from "@/shared/ui/doctor/DoctorMetricList";
import { DoctorStatCard } from "./analytics/clients/DoctorStatCard";
import {
  DoctorTodayAttentionDialog,
  type DoctorTodayAttentionKind,
} from "./DoctorTodayAttentionDialog";
import type { TodayDashboardData } from "./loadDoctorTodayDashboard";
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
        {/* Комментарии к упражнениям → диалог */}
        <DoctorStatCard
          id="doctor-today-left-kpi-comments"
          title="Комментарии"
          value={exerciseCommentsState.total}
          tone={exerciseCommentsState.total > 0 ? "warning" : "neutral"}
          onClick={() => openDialog("exerciseComments")}
        />
        {/* Онлайн-заявки → диалог */}
        <DoctorStatCard
          id="doctor-today-left-kpi-intake"
          title="Заявки"
          value={intakeCount}
          tone={intakeCount > 0 ? "warning" : "neutral"}
          onClick={() => openDialog("intake")}
        />
        {/* Тесты к проверке → диалог */}
        <DoctorStatCard
          id="doctor-today-left-kpi-tests"
          title="Тесты"
          value={pendingTestsTotal}
          tone={pendingTestsTotal > 0 ? "warning" : "neutral"}
          onClick={() => openDialog("pendingTests")}
        />
      </DoctorMetricList>

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
