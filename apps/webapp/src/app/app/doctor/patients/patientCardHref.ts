/** Canonical route to the new patient card (apps/app/doctor/patients/[userId]). */
export function patientCardHref(
  userId: string,
  options?: { tab?: "overview" | "karta" | "program" | "records" | "files" | "account" },
): string {
  const base = `/app/doctor/patients/${encodeURIComponent(userId)}`;
  if (options?.tab && options.tab !== "overview") {
    return `${base}?tab=${options.tab}`;
  }
  return base;
}
