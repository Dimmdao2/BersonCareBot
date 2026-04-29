import Link from "next/link";
import { Bell } from "lucide-react";
import type { ReminderRule } from "@/modules/reminders/types";
import { routePaths } from "@/app-layer/routes/paths";
import { patientHomeCardWarningClass, patientIconLeadingWarningClass } from "./patientHomeCardStyles";
import { patientButtonWarningOutlineClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

type Props = { rule: ReminderRule; scheduleLabel: string };

export function PatientHomeNextReminderCard({ rule, scheduleLabel }: Props) {
  const ruleLabel = rule.customTitle?.trim() || "Напоминание";

  return (
    <section aria-labelledby="patient-home-reminder-heading" data-reminder-rule-id={rule.id}>
      <article
        id="patient-home-next-reminder-card"
        className={cn(patientHomeCardWarningClass, "flex min-h-[88px] flex-col gap-3")}
      >
        <div className="flex gap-3">
          <div className={patientIconLeadingWarningClass} aria-hidden>
            <Bell className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p id="patient-home-reminder-heading" className="text-[13px] font-medium leading-[18px] text-[#92400e]">
              Следующее напоминание
            </p>
            <h2 className="mt-1 text-lg font-bold leading-6 text-[var(--patient-text-primary)]">{ruleLabel}</h2>
            <p className="mt-1 text-sm leading-5 text-[var(--patient-text-secondary)]">
              Ближайшее срабатывание: <span className="text-[var(--patient-text-primary)]">{scheduleLabel}</span>
              {rule.linkedObjectType ? <span> · {rule.linkedObjectType}</span> : null}
            </p>
          </div>
        </div>
        <Link href={routePaths.patientReminders} prefetch={false} className={patientButtonWarningOutlineClass}>
          Открыть напоминания
        </Link>
      </article>
    </section>
  );
}
