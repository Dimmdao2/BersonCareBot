"use client";

import {
  formatProgramItemExecutionLabel,
  formatProgramItemLastDoneSummaryText,
  resolveProgramItemExecutionDots,
  type ProgramItemLastDoneSummary,
} from "@/app/app/patient/treatment/programItemExecutionDisplay";
import { cn } from "@/lib/utils";
import { patientMutedTextClass, patientMutedTextStrongClass } from "@/shared/ui/patientVisual";

function ExecutionDots(props: {
  variant: "green" | "gray";
  dotCount: number;
  dotOverflow: number;
  align?: "start" | "end";
}) {
  const { variant, dotCount, dotOverflow, align = "start" } = props;
  const green = variant === "green";
  return (
    <div
      className={cn(
        "flex min-h-[10px] shrink-0 flex-wrap items-center gap-0.5",
        align === "end" ? "justify-end" : "justify-start",
      )}
      aria-label={green ? `Сегодня отмечено ${dotCount} раз` : "Не отмечено сегодня"}
    >
      {Array.from({ length: dotCount }, (_, i) => (
        <span
          key={i}
          className={cn(
            "size-2 shrink-0 rounded-full",
            green ? "bg-[#16a34a]" : "bg-muted-foreground/35",
          )}
          aria-hidden
        />
      ))}
      {dotOverflow > 0 ? (
        <span className="text-[10px] font-medium leading-none text-muted-foreground" aria-hidden>
          +{dotOverflow}
        </span>
      ) : null}
    </div>
  );
}

export function PatientProgramItemExecutionRow(props: {
  lastIso: string | null | undefined;
  todayCount: number;
  appDisplayTimeZone: string;
  lastDoneSummary?: ProgramItemLastDoneSummary | null;
  /** tile: inline label + dots; item: bar with optional last-done line below */
  variant?: "tile" | "itemPage";
  className?: string;
}) {
  const {
    lastIso,
    todayCount,
    appDisplayTimeZone,
    lastDoneSummary,
    variant = "tile",
    className,
  } = props;
  const label = formatProgramItemExecutionLabel({ lastIso, zone: appDisplayTimeZone });
  const dots = resolveProgramItemExecutionDots({
    lastIso,
    todayCount,
    zone: appDisplayTimeZone,
  });
  const lastDoneText = formatProgramItemLastDoneSummaryText(lastDoneSummary);

  if (variant === "itemPage") {
    return (
      <div className={cn("flex flex-col gap-0", className)}>
        <div className="-mx-4 flex flex-wrap items-center gap-2 border-b border-[var(--patient-border)]/50 bg-muted/15 px-4 py-2.5 lg:-mx-5 lg:px-5">
          <span className={cn("text-xs leading-snug", patientMutedTextStrongClass)}>{label}</span>
          <ExecutionDots
            variant={dots.variant}
            dotCount={dots.dotCount}
            dotOverflow={dots.dotOverflow}
            align="end"
          />
        </div>
        {lastDoneText ? (
          <p className={cn(patientMutedTextClass, "border-b border-[var(--patient-border)]/40 px-0 py-2 text-xs leading-snug")}>
            {lastDoneText}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-2", className)}>
      <p className={cn(patientMutedTextClass, "shrink-0 text-xs leading-tight")}>{label}</p>
      <ExecutionDots
        variant={dots.variant}
        dotCount={dots.dotCount}
        dotOverflow={dots.dotOverflow}
      />
    </div>
  );
}
