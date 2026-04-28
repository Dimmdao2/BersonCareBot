import Link from "next/link";
import type { ReminderRule } from "@/modules/reminders/types";
import { routePaths } from "@/app-layer/routes/paths";
import { patientHomeCardClass } from "./patientHomeCardStyles";

type Props = { rule: ReminderRule; scheduleLabel: string };

export function PatientHomeNextReminderCard({ rule, scheduleLabel }: Props) {
  return (
    <section aria-labelledby="patient-home-reminder-heading" data-reminder-rule-id={rule.id}>
      <h2 id="patient-home-reminder-heading" className="mb-2 text-base font-semibold">
        Следующее напоминание
      </h2>
      <div className={patientHomeCardClass}>
        <p className="text-sm text-muted-foreground">
          Ближайшее срабатывание: <span className="text-foreground">{scheduleLabel}</span>
          {rule.linkedObjectType ? (
            <span className="text-muted-foreground"> (тип: {rule.linkedObjectType})</span>
          ) : null}
          . Управление — в разделе «Помощник».
        </p>
        <Link
          href={routePaths.patientReminders}
          className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Открыть напоминания
        </Link>
      </div>
    </section>
  );
}
