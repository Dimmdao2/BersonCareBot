"use client";

import { useCallback, useState } from "react";
import { DoctorSection, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { DoctorMetricList } from "@/shared/ui/doctor/DoctorMetricList";
import { DoctorStatCard } from "./analytics/clients/DoctorStatCard";
import {
  DoctorTodayAttentionDialog,
  type DoctorTodayAttentionKind,
} from "./DoctorTodayAttentionDialog";
import type { TodayDashboardData } from "./loadDoctorTodayDashboard";

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
  pendingTestsCount: number;
  proactiveCount: number;
};

export function DoctorTodayAttentionSection({
  intakeCount,
  pendingTestsCount,
  proactiveCount,
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
      <DoctorSection id="doctor-today-section-attention" className="h-full gap-2">
        <DoctorSectionTitle>Требует внимания</DoctorSectionTitle>
        <DoctorMetricList aria-label="Требует внимания" className="grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2">
          <DoctorStatCard
            id="doctor-today-attention-intake"
            title="Онлайн-заявки"
            value={intakeCount}
            tone={intakeCount > 0 ? "warning" : "neutral"}
            onClick={() => openDialog("intake")}
          />
          <DoctorStatCard
            id="doctor-today-attention-pending-tests"
            title="Тесты к проверке"
            value={pendingTestsCount}
            tone={pendingTestsCount > 0 ? "warning" : "neutral"}
            onClick={() => openDialog("pendingTests")}
          />
          <DoctorStatCard
            id="doctor-today-attention-proactive"
            title="Сигналы пациентов"
            value={proactiveCount}
            tone={proactiveCount > 0 ? "warning" : "neutral"}
            onClick={() => openDialog("proactive")}
          />
          <DoctorStatCard
            id="doctor-today-attention-exercise-comments"
            title="Новые комментарии по упражнениям"
            value={exerciseCommentsState.total}
            tone={exerciseCommentsState.total > 0 ? "warning" : "neutral"}
            onClick={() => openDialog("exerciseComments")}
          />
        </DoctorMetricList>
      </DoctorSection>

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
