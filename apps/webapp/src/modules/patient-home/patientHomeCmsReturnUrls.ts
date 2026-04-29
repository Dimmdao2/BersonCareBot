import { PATIENT_HOME_CMS_BLOCK_CODES, type PatientHomeCmsBlockCode } from "@/modules/patient-home/blocks";

/** Куда по умолчанию ведёт «вернуться после создания» из doctor patient-home. */
export const PATIENT_HOME_CMS_DEFAULT_RETURN_PATH = "/app/doctor/patient-home";

const ALLOWED_BLOCK_CODES = new Set<string>(PATIENT_HOME_CMS_BLOCK_CODES);

function isAllowedReturnPath(returnTo: string): boolean {
  if (returnTo.includes("//") || returnTo.includes("://")) return false;
  if (!returnTo.startsWith("/app/")) return false;
  if (
    returnTo === PATIENT_HOME_CMS_DEFAULT_RETURN_PATH ||
    returnTo === "/app/settings/patient-home" ||
    returnTo.startsWith(`${PATIENT_HOME_CMS_DEFAULT_RETURN_PATH}?`) ||
    returnTo.startsWith("/app/settings/patient-home?")
  ) {
    return true;
  }
  return false;
}

export function assertPatientHomeCmsBlockCode(code: string): code is PatientHomeCmsBlockCode {
  return ALLOWED_BLOCK_CODES.has(code);
}

export type PatientHomeCmsReturnQuery = {
  returnTo: string;
  patientHomeBlock: PatientHomeCmsBlockCode;
  suggestedTitle?: string;
  suggestedSlug?: string;
};

/**
 * Разбор query для return-flow из редактора блоков главной (Phase 5).
 * Невалидные значения отбрасываются без throw.
 */
export function parsePatientHomeCmsReturnQuery(sp: {
  returnTo?: string | string[];
  patientHomeBlock?: string | string[];
  suggestedTitle?: string | string[];
  suggestedSlug?: string | string[];
}): PatientHomeCmsReturnQuery | null {
  const rawReturn = typeof sp.returnTo === "string" ? sp.returnTo.trim() : "";
  if (rawReturn && !isAllowedReturnPath(rawReturn)) return null;
  const returnTo = rawReturn || PATIENT_HOME_CMS_DEFAULT_RETURN_PATH;
  const blockRaw = typeof sp.patientHomeBlock === "string" ? sp.patientHomeBlock.trim() : "";
  if (!assertPatientHomeCmsBlockCode(blockRaw)) return null;
  const suggestedTitle =
    typeof sp.suggestedTitle === "string" && sp.suggestedTitle.trim() ? sp.suggestedTitle.trim().slice(0, 500) : undefined;
  const suggestedSlug =
    typeof sp.suggestedSlug === "string" && sp.suggestedSlug.trim()
      ? sp.suggestedSlug.trim().slice(0, 200)
      : undefined;
  return { returnTo, patientHomeBlock: blockRaw, suggestedTitle, suggestedSlug };
}

function appendQuery(
  basePath: string,
  q: { returnTo: string; patientHomeBlock: PatientHomeCmsBlockCode; suggestedTitle?: string; suggestedSlug?: string },
): string {
  const p = new URLSearchParams();
  p.set("returnTo", q.returnTo);
  p.set("patientHomeBlock", q.patientHomeBlock);
  if (q.suggestedTitle) p.set("suggestedTitle", q.suggestedTitle);
  if (q.suggestedSlug) p.set("suggestedSlug", q.suggestedSlug);
  return `${basePath}?${p.toString()}`;
}

export function buildPatientHomeContentNewUrl(q: {
  returnTo?: string;
  patientHomeBlock: PatientHomeCmsBlockCode;
  suggestedTitle?: string;
  suggestedSlug?: string;
}): string {
  const returnTo = q.returnTo && isAllowedReturnPath(q.returnTo) ? q.returnTo : PATIENT_HOME_CMS_DEFAULT_RETURN_PATH;
  return appendQuery("/app/doctor/content/new", {
    returnTo,
    patientHomeBlock: q.patientHomeBlock,
    suggestedTitle: q.suggestedTitle,
    suggestedSlug: q.suggestedSlug,
  });
}

export function buildPatientHomeSectionsNewUrl(q: { returnTo?: string; patientHomeBlock: PatientHomeCmsBlockCode }): string {
  const returnTo = q.returnTo && isAllowedReturnPath(q.returnTo) ? q.returnTo : PATIENT_HOME_CMS_DEFAULT_RETURN_PATH;
  return appendQuery("/app/doctor/content/sections/new", { returnTo, patientHomeBlock: q.patientHomeBlock });
}

export function buildPatientHomeCourseNewUrl(q: { returnTo?: string; patientHomeBlock: PatientHomeCmsBlockCode }): string {
  const returnTo = q.returnTo && isAllowedReturnPath(q.returnTo) ? q.returnTo : PATIENT_HOME_CMS_DEFAULT_RETURN_PATH;
  return appendQuery("/app/doctor/courses/new", { returnTo, patientHomeBlock: q.patientHomeBlock });
}
