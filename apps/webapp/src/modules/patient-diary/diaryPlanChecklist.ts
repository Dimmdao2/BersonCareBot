import {
  buildPatientProgramChecklistRows,
  isProgramChecklistItem,
  type PatientProgramChecklistRow,
} from "@/modules/treatment-program/patient-program-actions";
import { isStageZero } from "@/modules/treatment-program/stage-semantics";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";

/** Этапы для снимка дня: не skipped; pipeline — все ненулевые этапы (в т.ч. completed). */
function pickStagesForDiaryPlanSnapshot(detail: TreatmentProgramInstanceDetail) {
  return detail.stages.filter((s) => {
    if (s.status === "skipped") return false;
    if (isStageZero(s)) return true;
    return s.sortOrder > 0;
  });
}

/**
 * Порядок item id для снимка дневника — active и completed инстансы (в отличие от live checklist-today).
 */
export function buildDiaryPlanChecklistItemIds(detail: TreatmentProgramInstanceDetail): string[] {
  const rows = buildDiaryPlanChecklistRows(detail);
  return rows.map((r) => r.item.id);
}

export function buildDiaryPlanChecklistRows(detail: TreatmentProgramInstanceDetail): PatientProgramChecklistRow[] {
  const out: PatientProgramChecklistRow[] = [];
  for (const st of pickStagesForDiaryPlanSnapshot(detail)) {
    const groupsSorted = [...(st.groups ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
    );
    const groupTitleById = new Map(groupsSorted.map((g) => [g.id, g.title] as const));
    const itemsSorted = [...st.items].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    for (const item of itemsSorted) {
      if (!isProgramChecklistItem(item)) continue;
      out.push({
        stageId: st.id,
        stageTitle: st.title,
        stageSortOrder: st.sortOrder,
        groupId: item.groupId,
        groupTitle: item.groupId ? (groupTitleById.get(item.groupId) ?? null) : null,
        item,
      });
    }
  }
  out.sort((a, b) => a.stageSortOrder - b.stageSortOrder || a.item.sortOrder - b.item.sortOrder);
  return out;
}

/** Live «сегодня» на экране программы — только active (как checklist-today). */
export function buildLivePlanChecklistItemIds(detail: TreatmentProgramInstanceDetail): string[] {
  return buildPatientProgramChecklistRows(detail).map((r) => r.item.id);
}
