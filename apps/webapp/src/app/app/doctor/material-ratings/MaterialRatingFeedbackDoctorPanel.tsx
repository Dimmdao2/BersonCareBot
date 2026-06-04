import {
  MATERIAL_RATING_FEEDBACK_REASON_CODES,
  MATERIAL_RATING_FEEDBACK_REASON_LABELS,
} from "@/modules/material-rating-feedback/reasonCodes";
import type { MaterialRatingFeedbackDoctorSummary } from "@/modules/material-rating-feedback/ports";
import { doctorSectionCardClass, doctorSectionTitleClass } from "@/shared/ui/doctor/doctorVisual";
import { MaterialRatingFeedbackDoctorCommentsClient } from "./MaterialRatingFeedbackDoctorCommentsClient";

export function MaterialRatingFeedbackDoctorPanel({
  contentPageId,
  summary,
}: {
  contentPageId: string;
  summary: MaterialRatingFeedbackDoctorSummary;
}) {
  return (
    <section className={doctorSectionCardClass}>
      <h2 className={doctorSectionTitleClass}>Обратная связь (1–3)</h2>

      {summary.total === 0 ? (
        <p className="text-sm text-muted-foreground">Пока нет отзывов с низкой оценкой.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Всего: {summary.total}</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {MATERIAL_RATING_FEEDBACK_REASON_CODES.map((code) => (
              <li key={code} className="flex items-center justify-between gap-2 text-sm">
                <span>{MATERIAL_RATING_FEEDBACK_REASON_LABELS[code]}</span>
                <span className="tabular-nums text-muted-foreground">{summary.byReasonCode[code]}</span>
              </li>
            ))}
          </ul>

          <MaterialRatingFeedbackDoctorCommentsClient
            contentPageId={contentPageId}
            initialRows={summary.recent}
            total={summary.total}
          />
        </>
      )}
    </section>
  );
}
