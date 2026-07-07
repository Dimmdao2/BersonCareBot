export function formatPatientPackageShortLabel(displayNumber: number | null | undefined): string {
  if (displayNumber == null || !Number.isFinite(displayNumber) || displayNumber <= 0) {
    return "аб.";
  }
  return `аб.#${Math.trunc(displayNumber).toString().padStart(3, "0")}`;
}
