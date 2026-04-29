import Link from "next/link";
import { Bell } from "lucide-react";
import type { ReminderRule } from "@/modules/reminders/types";
import { patientHomeCardWarningClass, patientIconLeadingWarningClass } from "@/app/app/patient/home/patientHomeCardStyles";
import { patientButtonWarningOutlineClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Человекочитаемое окно и интервал для карточки «Следующее напоминание». */
export function formatReminderScheduleLabel(rule: ReminderRule): string {
  const startH = Math.floor(rule.windowStartMinute / 60);
  const startM = rule.windowStartMinute % 60;
  const endH = Math.floor(rule.windowEndMinute / 60);
  const endM = rule.windowEndMinute % 60;
  const window = `${pad2(startH)}:${pad2(startM)}–${pad2(endH)}:${pad2(endM)}`;
  const days = rule.daysMask.replace(/0/g, "").length;
  const daysPart =
    rule.daysMask === "1111111"
      ? "каждый день"
      : days > 0
        ? `${days} дн./нед.`
        : "по дням";
  const intervalPart =
    rule.intervalMinutes != null && rule.intervalMinutes > 0
      ? `каждые ${rule.intervalMinutes} мин`
      : null;
  return [intervalPart, window, daysPart].filter(Boolean).join(" · ");
}

type PatientHomeNextReminderCardProps = {
  ruleLabel: string;
  scheduleLabel: string;
  remindersHref: string;
};

/**
 * Карточка ближайшего напоминания: warning tone, ведущий bell (§10.6).
 */
export function PatientHomeNextReminderCard({
  ruleLabel,
  scheduleLabel,
  remindersHref,
}: PatientHomeNextReminderCardProps) {
  return (
    <article
      id="patient-home-next-reminder-card"
      className={cn(patientHomeCardWarningClass, "flex min-h-[88px] flex-col gap-3")}
    >
      <div className="flex gap-3">
        <div className={patientIconLeadingWarningClass} aria-hidden>
          <Bell className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium leading-[18px] text-[#92400e]">Следующее напоминание</p>
          <p className="mt-1 text-lg font-bold leading-6 text-[var(--patient-text-primary)]">{ruleLabel}</p>
          <p className="mt-1 text-sm leading-5 text-[var(--patient-text-secondary)]">{scheduleLabel}</p>
        </div>
      </div>
      <Link href={remindersHref} prefetch={false} className={patientButtonWarningOutlineClass}>
        Открыть напоминания
      </Link>
    </article>
  );
}
