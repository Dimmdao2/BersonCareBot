import Link from "next/link";
import type { ReminderRule } from "@/modules/reminders/types";
import { routePaths } from "@/app-layer/routes/paths";
import { patientHomeCardClass } from "./patientHomeCardStyles";

type Props = { rule: ReminderRule | null };

export function PatientHomeNextReminderCard({ rule }: Props) {
  if (!rule) return null;

  return (
    <section aria-labelledby="patient-home-reminder-heading" data-reminder-rule-id={rule.id}>
      <h2 id="patient-home-reminder-heading" className="mb-2 text-base font-semibold">
        Следующее напоминание
      </h2>
      <div className={patientHomeCardClass}>
        <p className="text-sm text-muted-foreground">
          По расписанию: напоминание активно (тип: {rule.linkedObjectType ?? "—"}). Управление — в разделе «Помощник».
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
