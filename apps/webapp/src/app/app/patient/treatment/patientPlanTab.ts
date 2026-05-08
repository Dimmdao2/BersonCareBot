/** Вкладки страницы плана (`/app/patient/treatment/[instanceId]?tab=…`). */
export type PatientPlanTab = "program" | "recommendations" | "progress";

const ALLOWED = new Set<PatientPlanTab>(["program", "recommendations", "progress"]);

export function parsePatientPlanTab(raw: unknown): PatientPlanTab {
  const s = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  const t = s.trim();
  if (ALLOWED.has(t as PatientPlanTab)) return t as PatientPlanTab;
  return "program";
}
