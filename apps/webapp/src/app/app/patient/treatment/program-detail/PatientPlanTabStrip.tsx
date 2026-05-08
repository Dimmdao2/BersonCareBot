"use client";

import { cn } from "@/lib/utils";
import type { PatientPlanTab } from "@/app/app/patient/treatment/patientPlanTab";

export function PatientPlanTabStrip(props: {
  activeTab: PatientPlanTab;
  onSelectTab: (tab: PatientPlanTab) => void;
  programTabSubtitle: string;
  recommendationListCount: number;
  progressTabProgramDaysLabel: string;
}) {
  const { activeTab, onSelectTab, programTabSubtitle, recommendationListCount, progressTabProgramDaysLabel } = props;
  return (
    <div
      className="sticky top-0 z-[5] grid grid-cols-3 gap-px border-x border-b border-[var(--patient-border)] bg-[var(--patient-border)] shadow-sm"
      role="tablist"
      aria-label="Разделы программы"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "program"}
        className={cn(
          "relative flex min-h-[3.25rem] cursor-pointer flex-col items-center justify-center gap-0.5 px-1 py-2 text-center outline-none transition-colors duration-200 lg:min-h-[3.5rem] lg:px-2",
          activeTab === "program" &&
            "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:z-[1] after:h-0.5 after:bg-[var(--patient-color-primary,#284da0)]",
          activeTab === "program" ? "bg-[#e4e2ff]" : "bg-[#f8f3fd]",
          "focus-visible:ring-2 focus-visible:ring-[var(--patient-color-primary)] focus-visible:ring-offset-0",
        )}
        onClick={() => {
          onSelectTab("program");
        }}
      >
        <span
          className={cn(
            "text-xs font-semibold lg:text-sm",
            activeTab === "program" ? "text-[var(--patient-color-primary,#284da0)]" : "text-[#444444]",
          )}
        >
          Программа
        </span>
        <span
          className={cn(
            "text-[10px] leading-tight lg:text-xs",
            activeTab === "program" ? "text-[#1e3a5f]" : "text-[#555555]",
          )}
        >
          {programTabSubtitle}
        </span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "recommendations"}
        className={cn(
          "relative flex min-h-[3.25rem] cursor-pointer flex-col items-center justify-center gap-0.5 px-1 py-2 text-center outline-none transition-colors duration-200 lg:min-h-[3.5rem] lg:px-2",
          activeTab === "recommendations" &&
            "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:z-[1] after:h-0.5 after:bg-[var(--patient-color-primary,#284da0)]",
          activeTab === "recommendations" ? "bg-[#e4e2ff]" : "bg-[#f8f3fd]",
          "focus-visible:ring-2 focus-visible:ring-[var(--patient-color-primary)] focus-visible:ring-offset-0",
        )}
        onClick={() => {
          onSelectTab("recommendations");
        }}
      >
        <span
          className={cn(
            "text-xs font-semibold lg:text-sm",
            activeTab === "recommendations" ? "text-[var(--patient-color-primary,#284da0)]" : "text-[#444444]",
          )}
        >
          Рекомендации
        </span>
        <span
          className={cn(
            "text-[10px] leading-tight lg:text-xs",
            activeTab === "recommendations" ? "text-[#1e3a5f]" : "text-[#555555]",
          )}
        >
          {recommendationListCount} рекомендаций
        </span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "progress"}
        className={cn(
          "relative flex min-h-[3.25rem] cursor-pointer flex-col items-center justify-center gap-0.5 px-1 py-2 text-center outline-none transition-colors duration-200 lg:min-h-[3.5rem] lg:px-2",
          activeTab === "progress" &&
            "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:z-[1] after:h-0.5 after:bg-[var(--patient-color-primary,#284da0)]",
          activeTab === "progress" ? "bg-[#e4e2ff]" : "bg-[#f8f3fd]",
          "focus-visible:ring-2 focus-visible:ring-[var(--patient-color-primary)] focus-visible:ring-offset-0",
        )}
        onClick={() => {
          onSelectTab("progress");
        }}
      >
        <span
          className={cn(
            "text-xs font-semibold lg:text-sm",
            activeTab === "progress" ? "text-[var(--patient-color-primary,#284da0)]" : "text-[#444444]",
          )}
        >
          Прогресс
        </span>
        <span
          className={cn(
            "text-[10px] leading-tight lg:text-xs",
            activeTab === "progress" ? "text-[#1e3a5f]" : "text-[#555555]",
          )}
        >
          {progressTabProgramDaysLabel}
        </span>
      </button>
    </div>
  );
}
