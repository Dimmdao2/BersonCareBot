import Link from "next/link";
import { Bell } from "lucide-react";
import type { ReminderRule } from "@/modules/reminders/types";
import { routePaths } from "@/app-layer/routes/paths";
import { patientHomeReminderCardGeometryClass } from "./patientHomeCardStyles";
import { patientLineClamp2Class } from "@/shared/ui/patientVisual";
import { appLoginWithNextHref } from "./patientHomeGuestNav";
import { PatientHomeSafeImage } from "./PatientHomeSafeImage";
import { cn } from "@/lib/utils";

const reminderCtaClass =
  "inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 text-sm font-semibold text-[#d97706] lg:ml-auto lg:w-[8.75rem]";

type Props = {
  rule: ReminderRule | null;
  scheduleLabel: string;
  blockIconImageUrl?: string | null;
  anonymousGuest?: boolean;
  personalTierOk?: boolean;
};

function LeadingIcon({ blockIconImageUrl }: { blockIconImageUrl?: string | null }) {
  return (
    <div
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#fef3c7] text-[var(--patient-color-warning)]"
      aria-hidden
    >
      <PatientHomeSafeImage
        src={blockIconImageUrl}
        alt=""
        className="size-6 rounded-md object-cover"
        loading="lazy"
        fallback={<Bell className="size-6" />}
      />
    </div>
  );
}

export function PatientHomeNextReminderCard({
  rule,
  scheduleLabel,
  blockIconImageUrl,
  anonymousGuest = false,
  personalTierOk = true,
}: Props) {
  if (!rule) {
    const remindersHref = anonymousGuest ? appLoginWithNextHref(routePaths.patientReminders) : routePaths.patientReminders;
    const ctaLabel = anonymousGuest ? "Войти и открыть напоминания" : "Открыть напоминания";
    return (
      <section aria-labelledby="patient-home-reminder-heading" data-reminder-empty>
        <article id="patient-home-next-reminder-card" className={patientHomeReminderCardGeometryClass}>
          <div className="flex min-h-0 gap-3">
            <LeadingIcon blockIconImageUrl={blockIconImageUrl} />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <p id="patient-home-reminder-heading" className="text-[13px] font-medium leading-[18px] text-[#92400e]">
                Следующее напоминание
              </p>
              <h2 className="mt-1 line-clamp-2 text-lg font-semibold leading-6 text-[var(--patient-text-primary)]">
                Пока нет ближайших
              </h2>
              <p className={cn(patientLineClamp2Class, "mt-1 text-sm leading-5 text-[var(--patient-text-secondary)]")}>
                {anonymousGuest ?
                  "Войдите, чтобы настроить напоминания о практиках и приёме лекарств."
                : !personalTierOk ?
                  "Напоминания станут доступны после активации профиля пациента."
                : "Добавьте правило напоминаний в разделе «Напоминания»."}
              </p>
            </div>
          </div>
          <Link href={remindersHref} prefetch={false} className={reminderCtaClass}>
            {ctaLabel}
          </Link>
        </article>
      </section>
    );
  }

  const ruleLabel = rule.customTitle?.trim() || "Напоминание";

  return (
    <section aria-labelledby="patient-home-reminder-heading" data-reminder-rule-id={rule.id}>
      <article id="patient-home-next-reminder-card" className={patientHomeReminderCardGeometryClass}>
        <div className="flex min-h-0 gap-3">
          <LeadingIcon blockIconImageUrl={blockIconImageUrl} />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <p id="patient-home-reminder-heading" className="text-[13px] font-medium leading-[18px] text-[#92400e]">
              Следующее напоминание
            </p>
            <h2 className="mt-1 line-clamp-2 text-lg font-semibold leading-6 text-[var(--patient-text-primary)]">{ruleLabel}</h2>
            <p className={cn(patientLineClamp2Class, "mt-1 text-sm leading-5 text-[var(--patient-text-secondary)]")}>
              Ближайшее срабатывание: <span className="text-[var(--patient-text-primary)]">{scheduleLabel}</span>
            </p>
          </div>
        </div>
        <Link href={routePaths.patientReminders} prefetch={false} className={reminderCtaClass}>
          Открыть напоминания
        </Link>
      </article>
    </section>
  );
}
