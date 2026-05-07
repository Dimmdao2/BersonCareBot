import Link from "next/link";
import type {
  TreatmentProgramInstanceDetail,
  TreatmentProgramInstanceSummary,
} from "@/modules/treatment-program/types";
import {
  patientHomeCardHeroClass,
} from "../home/patientHomeCardStyles";
import {
  omitDisabledInstanceStageItemsForPatientApi,
  selectCurrentWorkingStageForPatientDetail,
  splitPatientProgramStagesForDetailUi,
} from "@/modules/treatment-program/stage-semantics";
import { routePaths } from "@/app-layer/routes/paths";
import { cn } from "@/lib/utils";
import {
  patientCardCompactClass,
  patientCardListSectionClass,
  patientHeroPrimaryActionClass,
  patientHeroTitleBaseClass,
  patientInnerHeroListEmptyTitleClass,
  patientInnerHeroListPrimaryTitleClass,
  patientInlineLinkClass,
  patientMutedTextClass,
  patientSurfaceInfoClass,
  patientInnerPageStackClass,
} from "@/shared/ui/patientVisual";

/** Текущий этап для hero списка: та же семантика, что на detail (`pipeline` без этапа 0). */
export function patientProgramsListCurrentStageTitle(detail: TreatmentProgramInstanceDetail): string | null {
  const d = omitDisabledInstanceStageItemsForPatientApi(detail);
  const { pipeline } = splitPatientProgramStagesForDetailUi(d.stages);
  const cur = selectCurrentWorkingStageForPatientDetail(pipeline);
  const t = cur?.title?.trim();
  return t ? t : null;
}

export type PatientTreatmentProgramsListHero = {
  instanceId: string;
  title: string;
  currentStageTitle: string | null;
  planUpdatedLabel: string | null;
};

export function PatientTreatmentProgramsListClient(props: {
  hero: PatientTreatmentProgramsListHero | null;
  archived: TreatmentProgramInstanceSummary[];
  messagesHref: string;
}) {
  const { hero, archived, messagesHref } = props;

  return (
    <div className={patientInnerPageStackClass}>
      {hero ? (
        <section
          className={cn(patientHomeCardHeroClass, "relative isolate overflow-hidden p-4 lg:p-5")}
          aria-labelledby="patient-tp-list-hero-title"
        >
          <h2 id="patient-tp-list-hero-title" className={cn(patientHeroTitleBaseClass, patientInnerHeroListPrimaryTitleClass)}>
            {hero.title}
          </h2>
          <p className={cn(patientMutedTextClass, "mt-2 text-sm")}>
            {hero.currentStageTitle ? (
              <>
                Текущий этап: <span className="text-foreground">{hero.currentStageTitle}</span>
              </>
            ) : (
              <>Текущий этап: <span className="text-foreground">—</span></>
            )}
          </p>
          {hero.planUpdatedLabel?.trim() ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm font-medium" role="status">
              <span className="text-destructive" aria-hidden="true">●</span>
              <span>{hero.planUpdatedLabel.trim()}</span>
            </p>
          ) : null}
          <div className="mt-4">
            <Link
              href={routePaths.patientTreatmentProgram(hero.instanceId)}
              prefetch={false}
              className={cn(
                patientHeroPrimaryActionClass,
                "inline-flex min-h-9 items-center justify-center rounded-md px-4 py-2 text-sm no-underline",
              )}
            >
              Открыть программу
            </Link>
          </div>
        </section>
      ) : (
        <section
          className={cn(patientSurfaceInfoClass, "flex flex-col gap-3")}
          aria-labelledby="patient-tp-list-empty-heading"
        >
          <h2 id="patient-tp-list-empty-heading" className={cn(patientHeroTitleBaseClass, patientInnerHeroListEmptyTitleClass)}>
            Нет активной программы
          </h2>
          <p className="text-sm text-[var(--patient-surface-info-text)]">
            Здесь появится программа после назначения врачом.
          </p>
          <p>
            <Link href={messagesHref} prefetch={false} className={cn(patientInlineLinkClass, "text-sm font-medium")}>
              Написать в чат клиники
            </Link>
          </p>
        </section>
      )}

      {archived.length > 0 ? (
        <details className={cn(patientCardListSectionClass, "group")}>
          <summary className="cursor-pointer list-none py-1 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
            Завершённые программы
            <span className={cn(patientMutedTextClass, "ml-2 text-xs font-normal")}>({archived.length})</span>
          </summary>
          <ul className="m-0 mt-4 list-none space-y-3 border-t border-[var(--patient-border)]/60 p-0 pt-4">
            {archived.map((p) => (
              <li key={p.id}>
                <Link
                  href={routePaths.patientTreatmentProgram(p.id)}
                  prefetch={false}
                  className={cn(
                    patientCardCompactClass,
                    "block text-sm font-medium transition-colors hover:border-primary/30",
                  )}
                >
                  {p.title}
                  <span className={cn(patientMutedTextClass, "mt-1 block text-xs font-normal")}>завершена</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
