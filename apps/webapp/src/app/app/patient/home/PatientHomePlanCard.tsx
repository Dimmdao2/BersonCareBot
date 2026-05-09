import Link from "next/link";
import { ClipboardList } from "lucide-react";
import {
  patientHomeBlockHeadingClass,
  patientHomePlanCardClass,
  patientHomePlanCardTitleClampSmClass,
  patientHomeSecondaryCardTallHeightClass,
  patientIconLeadingClass,
} from "./patientHomeCardStyles";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import { PatientHomeSafeImage } from "./PatientHomeSafeImage";
import { cn } from "@/lib/utils";

export type PatientHomePlanCardInstance = {
  id: string;
  title: string;
};

type Props = {
  instance: PatientHomePlanCardInstance;
  /** Цель ссылки «Начать занятие» — пункт программы (exec) или обзор программы. */
  startLessonHref: string;
  /** «День N» слева от CTA; `null` — не показывать (как на экране программы до старта). */
  progressDay?: number | null;
  /** Были ли отметки по программе сегодня (чек-лист / активность за день). */
  todayPracticeDone?: boolean;
  blockIconImageUrl?: string | null;
  /** A5: одна строка для Today («План обновлён …»), если есть неснятые изменения. */
  planUpdatedLabel?: string | null;
};

function LeadingPlanIcon({ blockIconImageUrl }: { blockIconImageUrl?: string | null }) {
  return (
    <div className={patientIconLeadingClass} aria-hidden>
      <PatientHomeSafeImage
        src={blockIconImageUrl}
        alt=""
        className="size-7 rounded-full object-cover"
        loading="lazy"
        fallback={<ClipboardList className="size-7 text-[var(--patient-color-primary)]" />}
      />
    </div>
  );
}

/** Карточка «Мой план» на главной — только при активном назначении (см. `PatientHomeToday`). */
export function PatientHomePlanCard({
  instance,
  startLessonHref,
  progressDay = null,
  todayPracticeDone = false,
  blockIconImageUrl,
  planUpdatedLabel = null,
}: Props) {
  return (
    <section aria-labelledby="patient-home-plan-heading">
      <article
        id="patient-home-plan-card"
        className={cn(patientHomePlanCardClass, patientHomeSecondaryCardTallHeightClass)}
      >
        <div className="flex min-h-0 gap-3">
          <LeadingPlanIcon blockIconImageUrl={blockIconImageUrl} />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <h3 id="patient-home-plan-heading" className={cn(patientHomeBlockHeadingClass, "shrink-0")}>
              Мой план реабилитации
            </h3>
            <p className={cn(patientHomePlanCardTitleClampSmClass, "mt-0.5")}>{instance.title}</p>
            {planUpdatedLabel?.trim() ? (
              <p className={cn(patientMutedTextClass, "mt-1 text-xs font-medium text-foreground")}>{planUpdatedLabel.trim()}</p>
            ) : null}
          </div>
        </div>
        <div
          className={cn(
            "mt-auto flex min-h-9 flex-wrap items-center gap-x-3 gap-y-2 -mb-1",
            progressDay != null ? "justify-between" : "justify-end",
          )}
        >
          {progressDay != null ?
            <div
              className="flex min-w-0 flex-col gap-0.5"
              aria-label={todayPracticeDone ? "Сегодня занятие отмечено" : "Сегодня занятий по программе не отмечено"}
            >
              <p className="text-[11px] font-normal tabular-nums leading-snug text-[var(--patient-block-heading)]">
                День {progressDay}
              </p>
              <div className="flex items-center gap-1.5 text-[11px] font-normal leading-snug text-[var(--patient-block-heading)]">
                <span>Сегодня:</span>
                <span
                  className={cn(
                    "inline-block size-[7px] shrink-0 rounded-full",
                    todayPracticeDone ? "bg-[var(--patient-color-success)]" : "bg-[var(--patient-border)]",
                  )}
                  aria-hidden
                />
              </div>
            </div>
          : null}
          <Link
            href={startLessonHref}
            prefetch={false}
            className={cn(
              "inline-flex min-h-9 min-w-[8rem] shrink-0 items-center justify-center rounded-md border border-[#b4bae4] bg-[#e2e2fa] px-5 text-sm font-medium text-[#1b4585] shadow-[0_3px_10px_rgba(40,77,160,0.12)] transition-colors md:px-6",
              "hover:bg-[#ddd2f5] active:bg-[#d1c4ef]",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1b4585]/35",
            )}
          >
            Начать занятие
          </Link>
        </div>
      </article>
    </section>
  );
}
