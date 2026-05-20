import type { PatientHomeBlockCode } from "./ports";

/** Bundled PNG leading icons for patient home blocks (`public/patient/home/icons/`). */
export const PATIENT_HOME_BLOCK_STATIC_ICON_URL: Partial<Record<PatientHomeBlockCode, string>> = {
  booking: "/patient/home/icons/booking.png",
  sos: "/patient/home/icons/sos.png",
  progress: "/patient/home/icons/progress.png",
  next_reminder: "/patient/home/icons/next-reminder.png",
  plan: "/patient/home/icons/plan.png",
};

/** Bundled mood scale icons (`public/patient/home/icons/mood/`). */
export const PATIENT_HOME_MOOD_STATIC_ICON_URL: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "/patient/home/icons/mood/1.png",
  2: "/patient/home/icons/mood/2.png",
  3: "/patient/home/icons/mood/3.png",
  4: "/patient/home/icons/mood/4.png",
  5: "/patient/home/icons/mood/5.png",
};

export function resolvePatientHomeBlockLeadingIconUrl(
  code: PatientHomeBlockCode,
  cmsIconImageUrl: string | null | undefined,
): string | null {
  const staticUrl = PATIENT_HOME_BLOCK_STATIC_ICON_URL[code];
  if (staticUrl) return staticUrl;
  const cms = cmsIconImageUrl?.trim();
  return cms && cms.length > 0 ? cms : null;
}
