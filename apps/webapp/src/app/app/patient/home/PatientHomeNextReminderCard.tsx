import Link from "next/link";
import { Bell } from "lucide-react";
import type { ReminderRule } from "@/modules/reminders/types";
import { routePaths } from "@/app-layer/routes/paths";
import {
  patientHomeBlockCaptionSmClamp2Mt1Class,
  patientHomeBlockHeadingClass,
  patientHomeCardTitleClampSmClass,
  patientHomeReminderCardGeometryClass,
} from "./patientHomeCardStyles";
import { appLoginWithNextHref } from "./patientHomeGuestNav";
import { PatientHomeSafeImage } from "./PatientHomeSafeImage";
import { patientButtonWarningOutlineClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

const reminderCtaMobileClass =
  "!min-h-10 !w-auto min-w-[6.75rem] self-end px-3 text-[13px] lg:hidden";
const reminderCtaDesktopClass =
  "!w-auto min-w-[8rem] self-end px-4 text-sm max-lg:hidden";

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
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-[#fef3c7] text-[var(--patient-color-warning)] lg:size-14"
      aria-hidden
    >
      <PatientHomeSafeImage
        src={blockIconImageUrl}
        alt=""
        className="size-7 rounded-full object-cover"
        loading="lazy"
        fallback={<Bell className="size-7" />}
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
    const ctaLabel = anonymousGuest ? "Войти" : "Настроить";
    return (
      <section aria-labelledby="patient-home-reminder-heading" data-reminder-empty>
        <article id="patient-home-next-reminder-card" className={patientHomeReminderCardGeometryClass}>
          <div className="flex min-h-0 gap-3 max-lg:items-center">
            <LeadingIcon blockIconImageUrl={blockIconImageUrl} />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <h3 id="patient-home-reminder-heading" className={cn(patientHomeBlockHeadingClass, "whitespace-nowrap")}>
                Следующее напоминание
              </h3>
              <h2 className={cn(patientHomeCardTitleClampSmClass, "mt-1")}>
                Пока нет ближайших
              </h2>
              <p className={cn(patientHomeBlockCaptionSmClamp2Mt1Class, "lg:hidden")}>
                {anonymousGuest ?
                  "Чтобы настроить напоминания."
                : !personalTierOk ?
                  "После активации профиля."
                : "Добавьте время практики."}
              </p>
            </div>
            <Link href={remindersHref} prefetch={false} className={cn(patientButtonWarningOutlineClass, reminderCtaMobileClass)}>
              {ctaLabel}
            </Link>
          </div>
          <Link href={remindersHref} prefetch={false} className={cn(patientButtonWarningOutlineClass, reminderCtaDesktopClass)}>
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
        <div className="flex min-h-0 gap-3 max-lg:items-center">
          <LeadingIcon blockIconImageUrl={blockIconImageUrl} />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <h3 id="patient-home-reminder-heading" className={cn(patientHomeBlockHeadingClass, "whitespace-nowrap")}>
              Следующее напоминание
            </h3>
            <h2 className={cn(patientHomeCardTitleClampSmClass, "mt-1")}>{scheduleLabel}</h2>
            <p className={cn(patientHomeBlockCaptionSmClamp2Mt1Class, "lg:hidden")}>
              {ruleLabel}
            </p>
          </div>
          <Link href={routePaths.patientReminders} prefetch={false} className={cn(patientButtonWarningOutlineClass, reminderCtaMobileClass)}>
            Изменить
          </Link>
        </div>
        <Link href={routePaths.patientReminders} prefetch={false} className={cn(patientButtonWarningOutlineClass, reminderCtaDesktopClass)}>
          Изменить
        </Link>
      </article>
    </section>
  );
}
