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
import { appLoginWithNextHref } from "./patientHomeGuestNav";
import { PatientHomeSafeImage } from "./PatientHomeSafeImage";
import { cn } from "@/lib/utils";

type Props = {
  rule: ReminderRule | null;
  scheduleLabel: string;
  blockIconImageUrl?: string | null;
  anonymousGuest?: boolean;
  personalTierOk?: boolean;
};

function LeadingIcon({ blockIconImageUrl }: { blockIconImageUrl?: string | null }) {
  return (
    <div className={patientIconLeadingWarningClass} aria-hidden>
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
        <article
          id="patient-home-next-reminder-card"
          className={cn(patientHomeCardWarningClass, patientHomeSecondaryCardShortHeightClass)}
        >
          <div className="flex min-h-0 flex-1 gap-3">
            <LeadingIcon blockIconImageUrl={blockIconImageUrl} />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <p id="patient-home-reminder-heading" className="shrink-0 text-[13px] font-medium leading-[18px] text-[#92400e]">
                Следующее напоминание
              </p>
              <h2 className={cn(patientHomeCardTitleClampLgClass, "mt-1")}>Пока нет ближайших</h2>
              <p className={cn(patientHomeCardSubtitleClampSmClass, "mt-1")}>
                {anonymousGuest ?
                  "Войдите, чтобы настроить напоминания о практиках и приёме лекарств."
                : !personalTierOk ?
                  "Напоминания станут доступны после активации профиля пациента."
                : "Добавьте правило напоминаний в разделе «Напоминания»."}
              </p>
            </div>
          </div>
          <Link href={remindersHref} prefetch={false} className={cn(patientButtonWarningOutlineClass, "shrink-0")}>
            {ctaLabel}
          </Link>
        </article>
      </section>
    );
  }

  const ruleLabel = rule.customTitle?.trim() || "Напоминание";

  return (
    <section aria-labelledby="patient-home-reminder-heading" data-reminder-rule-id={rule.id}>
      <article
        id="patient-home-next-reminder-card"
        className={cn(patientHomeCardWarningClass, patientHomeSecondaryCardShortHeightClass)}
      >
        <div className="flex min-h-0 flex-1 gap-3">
          <LeadingIcon blockIconImageUrl={blockIconImageUrl} />
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
