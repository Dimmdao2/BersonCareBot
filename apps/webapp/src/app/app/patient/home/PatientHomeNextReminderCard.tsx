import Link from "next/link";
import { Bell } from "lucide-react";
import type { ReminderRule } from "@/modules/reminders/types";
import { routePaths } from "@/app-layer/routes/paths";
import {
  patientHomeBlockCaptionSmClamp2Mt1Class,
  patientHomeCardTitleClampSmClass,
  patientHomeReminderCardGeometryClass,
  patientHomeReminderMobileHeadingClass,
  patientHomeReminderMobileSubtitleClass,
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
const reminderCtaMobileClass = cn(reminderCtaBaseClass, "min-h-9 min-w-[5.5rem] self-end px-2.5 text-[12px] lg:hidden");
const reminderCtaDesktopClass = cn(reminderCtaBaseClass, "min-h-10 min-w-[8rem] self-end px-4 text-sm max-lg:hidden");

type Props = {
  rule: ReminderRule | null;
  scheduleLabel: string;
  blockIconImageUrl?: string | null;
  anonymousGuest?: boolean;
  personalTierOk?: boolean;
  /** Local app-day progress; omitted for guests / builds without journal. */
  reminderDaySummary?: {
    done: number;
    plannedTotal: number;
    muted: boolean;
    muteRemainingLabel: string | null;
    hasConfiguredSchedule: boolean;
  } | null;
};

function LeadingIcon({ blockIconImageUrl }: { blockIconImageUrl?: string | null }) {
  return (
    <div
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#fef3c7] text-[var(--patient-color-warning)] lg:size-14"
      aria-hidden
    >
      <PatientHomeSafeImage
        src={blockIconImageUrl}
        alt=""
        className="size-6 rounded-full object-cover lg:size-7"
        loading="lazy"
        fallback={<Bell className="size-6 lg:size-7" />}
      />
    </div>
  );
}

function reminderMobileSubtitle(
  scheduleLabel: string,
  reminderDaySummary: Props["reminderDaySummary"],
): string {
  if (reminderDaySummary?.muted) {
    const tail = reminderDaySummary.muteRemainingLabel?.trim();
    return tail ? `Напоминания заглушены на ${tail}` : "Напоминания заглушены";
  }
  return scheduleLabel;
}

function ReminderDaySummaryLines({
  summary,
}: {
  summary: {
    done: number;
    plannedTotal: number;
    muted: boolean;
    muteRemainingLabel: string | null;
    hasConfiguredSchedule: boolean;
  };
}) {
  if (summary.muted) {
    const tail = summary.muteRemainingLabel?.trim();
    return (
      <p className={cn(patientHomeBlockCaptionSmClamp2Mt1Class, "text-muted-foreground")}>
        {tail ? `Напоминания заглушены на ${tail}` : "Напоминания заглушены"}
      </p>
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
  if (summary.hasConfiguredSchedule) {
    return <p className={patientHomeBlockCaptionSmClamp2Mt1Class}>На сегодня напоминаний нет</p>;
  }
  return null;
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
          <div className="flex min-h-0 gap-2 max-lg:items-center lg:gap-3">
            <LeadingIcon blockIconImageUrl={blockIconImageUrl} />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <h3 id="patient-home-reminder-heading" className={cn(patientHomeReminderMobileHeadingClass, "lg:whitespace-nowrap")}>
                Следующее напоминание
              </h3>
              <p className={cn(patientHomeReminderMobileSubtitleClass, "lg:hidden")}>{reminderMobileSubtitle(scheduleLabel, reminderDaySummary)}</p>
              <div className="hidden lg:block">
                <p className={cn(patientHomeCardTitleClampSmClass, "mt-1")}>{scheduleLabel}</p>
                {reminderDaySummary ? <ReminderDaySummaryLines summary={reminderDaySummary} /> : null}
                {(anonymousGuest || !personalTierOk) && (
                  <p className={patientHomeBlockCaptionSmClamp2Mt1Class}>
                    {anonymousGuest ? "Чтобы настроить напоминания." : "После активации профиля."}
                  </p>
                )}
              </div>
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

  return (
    <section aria-labelledby="patient-home-reminder-heading" data-reminder-rule-id={rule.id}>
      <article id="patient-home-next-reminder-card" className={patientHomeReminderCardGeometryClass}>
        <div className="flex min-h-0 gap-2 max-lg:items-center lg:gap-3">
          <LeadingIcon blockIconImageUrl={blockIconImageUrl} />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <h3 id="patient-home-reminder-heading" className={cn(patientHomeReminderMobileHeadingClass, "lg:whitespace-nowrap")}>
              Следующее напоминание
            </h3>
            <p className={cn(patientHomeReminderMobileSubtitleClass, "lg:hidden")}>{reminderMobileSubtitle(scheduleLabel, reminderDaySummary)}</p>
            <div className="hidden lg:block">
              <p className={cn(patientHomeCardTitleClampSmClass, "mt-1")}>{scheduleLabel}</p>
              {reminderDaySummary ? <ReminderDaySummaryLines summary={reminderDaySummary} /> : null}
            </div>
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
