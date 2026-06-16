/** Canonical route to the new patient card (apps/app/doctor/patients/[userId]). */
export function patientCardHref(
  userId: string,
  options?: {
    tab?: "overview" | "karta" | "program" | "records" | "files" | "account";
    /** Open the new-visit panel pre-linked to this appointment ID. */
    createVisitFrom?: string;
    /** ISO date string (YYYY-MM-DD) of the appointment to pre-fill the visit date. */
    visitDate?: string;
  },
): string {
  const base = `/app/doctor/patients/${encodeURIComponent(userId)}`;
  const params = new URLSearchParams();
  if (options?.tab && options.tab !== "overview") params.set("tab", options.tab);
  if (options?.createVisitFrom) params.set("createVisitFrom", options.createVisitFrom);
  if (options?.visitDate) params.set("visitDate", options.visitDate);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
