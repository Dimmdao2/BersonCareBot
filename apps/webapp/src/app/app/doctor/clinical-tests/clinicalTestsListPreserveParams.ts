import {
  exerciseLoadTypeWriteAllowSet,
  parseExerciseLoadFormValue,
} from "@/modules/lfk-exercises/exerciseLoadTypeReference";
import { appendRegionParamFromListPreserve } from "@/shared/lib/doctorCatalogClientUrlSync";

/** Сборка list-preserve query для redirect после inline save/archive/unarchive клинических тестов. В URL только `region` (код), не `regionRefId`. */
export function appendClinicalTestsListPreserveToSearchParams(
  sp: URLSearchParams,
  formData: FormData,
): void {
  const q = formData.get("listQ");
  if (typeof q === "string" && q.trim()) sp.set("q", q.trim());
  const ts = formData.get("listTitleSort");
  if (ts === "asc" || ts === "desc") sp.set("titleSort", ts);
  appendRegionParamFromListPreserve(sp, formData.get("listRegion"));
  const loadAllow = exerciseLoadTypeWriteAllowSet([]);
  const loadParsed = parseExerciseLoadFormValue(formData.get("listLoad"), loadAllow);
  if (loadParsed) sp.set("load", loadParsed);
  const assessment = formData.get("listAssessment");
  if (typeof assessment === "string" && assessment.trim()) {
    sp.set("assessment", assessment.trim());
  }
  const listStatus = formData.get("listStatus");
  if (listStatus === "active" || listStatus === "all" || listStatus === "archived") {
    sp.set("status", listStatus);
  }
}
