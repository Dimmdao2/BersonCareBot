export function patientPackageProductRef(patientPackageId: string): string {
  return `patient_package:${patientPackageId}`;
}

export function parsePatientPackageProductRef(productRef: string | null | undefined): string | null {
  if (!productRef?.startsWith("patient_package:")) return null;
  const id = productRef.slice("patient_package:".length).trim();
  return id || null;
}
