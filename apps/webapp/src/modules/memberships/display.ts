export function formatPatientPackageShortLabel(displayNumber: number | null | undefined): string {
  if (displayNumber == null || !Number.isFinite(displayNumber) || displayNumber <= 0) {
    return "аб.";
  }
  return `аб.#${Math.trunc(displayNumber).toString().padStart(3, "0")}`;
}

function formatPatientPackageDate(iso: string): string {
  const datePart = iso.slice(0, 10);
  const parts = datePart.split("-");
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return datePart;
}

export function formatPatientPackageLongLabel(
  displayNumber: number | null | undefined,
  soldAt?: string | null,
): string {
  const number =
    displayNumber == null || !Number.isFinite(displayNumber) || displayNumber <= 0
      ? "аб #—"
      : `аб #${Math.trunc(displayNumber).toString().padStart(3, "0")}`;
  return soldAt ? `${number} от ${formatPatientPackageDate(soldAt)}` : number;
}
