import { routePaths } from "@/app-layer/routes/paths";

/** Relative path for Web Push / PWA open (same-origin, `/app/*`). */
export function buildPatientBroadcastOpenPath(auditId: string): string {
  return routePaths.patientBroadcast(auditId);
}
