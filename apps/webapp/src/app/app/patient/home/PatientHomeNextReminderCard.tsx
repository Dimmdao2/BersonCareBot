import Link from "next/link";
import { Bell } from "lucide-react";
import type { ReminderRule } from "@/modules/reminders/types";
import { routePaths } from "@/app-layer/routes/paths";
import {
  patientHomeCardSubtitleClampSmClass,
  patientHomeCardTitleClampLgClass,
  patientHomeCardWarningClass,
  patientHomeSecondaryCardShortHeightClass,
  patientIconLeadingWarningClass,
} from "./patientHomeCardStyles";
import { patientButtonWarningOutlineClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

type Props = { rule: ReminderRule; scheduleLabel: string };

export function PatientHomeNextReminderCard({ rule, scheduleLabel }: Props) {
  const ruleLabel = rule.customTitle?.trim() || "Напоминание";

  return (
    <section aria-labelledby="patient-home-reminder-heading" data-reminder-rule-id={rule.id}>
      <article
        id="patient-home-next-reminder-card"
        className={cn(patientHomeCardWarningClass, patientHomeSecondaryCardShortHeightClass)}
      >
        <div className="flex min-h-0 flex-1 gap-3">
          <div className={patientIconLeadingWarningClass} aria-hidden>
            <Bell className="size-6" />
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <p id="patient-home-reminder-heading" className="shrink-0 text-[13px] font-medium leading-[18px] text-[#92400e]">
              Следующее напоминание
            </p>
            <h2 className={cn(patientHomeCardTitleClampLgClass, "mt-1")}>{ruleLabel}</h2>
            <p className={cn(patientHomeCardSubtitleClampSmClass, "mt-1")}>
              Ближайшее срабатывание: <span className="text-[var(--patient-text-primary)]">{scheduleLabel}</span>
            </p>
          </div>
        </div>
        <Link href={routePaths.patientReminders} prefetch={false} className={cn(patientButtonWarningOutlineClass, "shrink-0")}>
          Открыть напоминания
        </Link>
      </article>
    </section>
  );
}
