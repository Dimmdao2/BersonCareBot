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
import { cn } from "@/lib/utils";

/**
 * Warning-кнопка по ширине контента (reminder CTA).
 * `patientButtonWarningOutlineClass` содержит `w-full`, что здесь не нужно —
 * классы собраны вручную без него.
 */
const reminderCtaBaseClass = cn(
  "inline-flex min-w-0 items-center justify-center gap-2 rounded-md border border-[#fde68a] bg-[#fffbeb] font-bold text-[#d97706] transition-colors",
  "hover:bg-[#fef3c7]/80 active:bg-[#fef3c7]",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f59e0b]",
);
const reminderCtaMobileClass = cn(reminderCtaBaseClass, "min-h-10 min-w-[6.75rem] self-end px-3 text-[13px] lg:hidden");
const reminderCtaDesktopClass = cn(reminderCtaBaseClass, "min-h-10 min-w-[8rem] self-end px-4 text-sm max-lg:hidden");

type Props = {
  rule: ReminderRule | null;
  scheduleLabel: string;
  blockIconImageUrl?: string | null;
  anonymousGuest?: boolean;
  personalTierOk?: boolean;
  /** Local app-day progress; omitted for guests / builds without journal. */
  reminderDaySummary?: { done: number; plannedTotal: number; muted: boolean } | null;
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

function ReminderDaySummaryLines({
  summary,
}: {
  summary: { done: number; plannedTotal: number; muted: boolean };
}) {
  if (summary.muted) {
    return (
      <p className={cn(patientHomeBlockCaptionSmClamp2Mt1Class, "text-muted-foreground")}>Уведомления на паузе</p>
    );
  }
  if (summary.plannedTotal > 0) {
    return (
      <p
        className={patientHomeBlockCaptionSmClamp2Mt1Class}
        aria-label={`Сегодня: ${summary.done} из ${summary.plannedTotal}`}
      >
        <span className="font-medium tabular-nums">{summary.done}</span>
        <span> из {summary.plannedTotal}</span>
      </p>
    );
  }
  return <p className={patientHomeBlockCaptionSmClamp2Mt1Class}>На сегодня напоминаний нет</p>;
}

export function PatientHomeNextReminderCard({
  rule,
  scheduleLabel,
  blockIconImageUrl,
  anonymousGuest = false,
  personalTierOk = true,
  reminderDaySummary = null,
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
              <p className={cn(patientHomeCardTitleClampSmClass, "mt-1")}>
                Пока нет ближайших
              </p>
              {reminderDaySummary ? <ReminderDaySummaryLines summary={reminderDaySummary} /> : null}
              <p className={cn(patientHomeBlockCaptionSmClamp2Mt1Class, "lg:hidden")}>
                {anonymousGuest ?
                  "Чтобы настроить напоминания."
                : !personalTierOk ?
                  "После активации профиля."
                : "Добавьте время практики."}
              </p>
            </div>
            <Link href={remindersHref} prefetch={false} className={reminderCtaMobileClass}>
              {ctaLabel}
            </Link>
          </div>
          <Link href={remindersHref} prefetch={false} className={reminderCtaDesktopClass}>
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
            <p className={cn(patientHomeCardTitleClampSmClass, "mt-1")}>{scheduleLabel}</p>
            {reminderDaySummary ? <ReminderDaySummaryLines summary={reminderDaySummary} /> : null}
            <p className={cn(patientHomeBlockCaptionSmClamp2Mt1Class, "lg:hidden")}>
              {ruleLabel}
            </p>
          </div>
          <Link href={routePaths.patientReminders} prefetch={false} className={reminderCtaMobileClass}>
            Изменить
          </Link>
        </div>
        <Link href={routePaths.patientReminders} prefetch={false} className={reminderCtaDesktopClass}>
          Изменить
        </Link>
      </article>
    </section>
  );
}
