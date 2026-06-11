"use client";

import { useCallback, useState } from "react";
import { DoctorSection, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { DoctorEmptyState } from "@/shared/ui/doctor/DoctorEmptyState";
import { doctorSectionSubtitleClass } from "@/shared/ui/doctor/doctorVisual";
import { Button } from "@/shared/ui/doctor/primitives/button";
import {
  DoctorTodayAttentionDialog,
} from "./DoctorTodayAttentionDialog";
import type { TodayDashboardData } from "./loadDoctorTodayDashboard";

type Props = Pick<
  TodayDashboardData,
  | "proactiveInsights"
  | "proactiveInsightsTotal"
  | "proactiveInsightsTruncated"
  // Диалогу нужны и остальные props, передаём пустые для неактивных вкладок
  | "newIntakeRequests"
  | "unreadConversations"
  | "unreadTotal"
  | "pendingProgramTests"
  | "pendingProgramTestsTotal"
  | "pendingProgramTestsTruncated"
  | "exerciseCommentAttentionItems"
  | "exerciseCommentAttentionTotal"
  | "exerciseCommentAttentionTruncated"
>;

export function DoctorTodaySignalsSection({
  proactiveInsights,
  proactiveInsightsTotal,
  proactiveInsightsTruncated,
  newIntakeRequests,
  unreadConversations,
  unreadTotal,
  pendingProgramTests,
  pendingProgramTestsTotal,
  pendingProgramTestsTruncated,
  exerciseCommentAttentionItems,
  exerciseCommentAttentionTotal,
  exerciseCommentAttentionTruncated,
}: Props) {
  const [open, setOpen] = useState(false);
  const openDialog = useCallback(() => setOpen(true), []);

  const firstSignal = proactiveInsights[0] ?? null;

  return (
    <>
      <DoctorSection id="doctor-today-signals">
        <div className="flex items-center justify-between gap-2">
          <DoctorSectionTitle>Сигналы пациентов</DoctorSectionTitle>
          {proactiveInsightsTotal > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-auto px-2 py-0.5 text-xs"
              onClick={openDialog}
            >
              {proactiveInsightsTotal}
            </Button>
          ) : null}
        </div>
        {proactiveInsightsTotal === 0 ? (
          <DoctorEmptyState>
            <p>Сигналов пациентов нет</p>
          </DoctorEmptyState>
        ) : (
          <div className="flex flex-col gap-1">
            {firstSignal ? (
              <p className={doctorSectionSubtitleClass}>
                {firstSignal.patientDisplayName}
                {firstSignal.summary ? ` — ${firstSignal.summary}` : ""}
              </p>
            ) : null}
            {proactiveInsightsTotal > 1 ? (
              <button
                type="button"
                className="w-fit text-left text-xs text-primary underline underline-offset-2"
                onClick={openDialog}
              >
                Ещё {proactiveInsightsTotal - 1} сигнал
                {proactiveInsightsTotal - 1 === 1 ? "" : "а"}
              </button>
            ) : null}
          </div>
        )}
      </DoctorSection>

      <DoctorTodayAttentionDialog
        open={open}
        onOpenChange={setOpen}
        kind="proactive"
        newIntakeRequests={newIntakeRequests}
        unreadConversations={unreadConversations}
        unreadTotal={unreadTotal}
        pendingProgramTests={pendingProgramTests}
        pendingProgramTestsTotal={pendingProgramTestsTotal}
        pendingProgramTestsTruncated={pendingProgramTestsTruncated}
        proactiveInsights={proactiveInsights}
        proactiveInsightsTotal={proactiveInsightsTotal}
        proactiveInsightsTruncated={proactiveInsightsTruncated}
        exerciseCommentAttentionItems={exerciseCommentAttentionItems}
        exerciseCommentAttentionTotal={exerciseCommentAttentionTotal}
        exerciseCommentAttentionTruncated={exerciseCommentAttentionTruncated}
        onExerciseCommentResolved={() => {
          /* управление состоянием в DoctorTodayLeftKpiRow */
        }}
      />
    </>
  );
}
