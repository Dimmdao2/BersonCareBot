export type PatientHomeGoalsFlameState = "incomplete" | "met" | "exceeded";

/** Непрозрачность огонька: блеклый, пока цели дня не закрыты. */
export const PATIENT_HOME_GOALS_FLAME_OPACITY_INCOMPLETE = 0.22;

export const PATIENT_HOME_GOALS_FLAME_OPACITY_ACTIVE = 1;

export function resolvePatientHomeGoalsFlameState(params: {
  doneTotal: number;
  plannedTotal: number;
}): PatientHomeGoalsFlameState | null {
  const planned = Math.max(0, Math.floor(params.plannedTotal));
  if (planned <= 0) return null;
  const done = Math.max(0, Math.floor(params.doneTotal));
  if (done < planned) return "incomplete";
  if (done > planned) return "exceeded";
  return "met";
}

export function patientHomeGoalsFlameOpacity(state: PatientHomeGoalsFlameState | null): number {
  if (state === "met" || state === "exceeded") return PATIENT_HOME_GOALS_FLAME_OPACITY_ACTIVE;
  return PATIENT_HOME_GOALS_FLAME_OPACITY_INCOMPLETE;
}

export function patientHomeGoalsFlameCaption(state: PatientHomeGoalsFlameState): string {
  switch (state) {
    case "incomplete":
      return "Еще немного и все получится!";
    case "met":
      return "Все цели выполнены!";
    case "exceeded":
      return "Цели перевыполнены! Так держать!";
  }
}
