/** Якоря секций карточки клиента (см. `DOCTOR_CLIENT_ANCHOR_TO_TAB`). */
export const DOCTOR_CLIENT_PROGRAM_SECTION_ANCHOR = "doctor-client-section-treatment-programs";
export const DOCTOR_CLIENT_PENDING_TESTS_SECTION_ANCHOR = "doctor-client-section-pending-program-tests";

/** Canonical route карточки клиента с опциональным scope и hash секции. */
export function doctorClientProfileHref(
  userId: string,
  options?: { profileListScope?: string; hash?: string; openChat?: boolean },
): string {
  const params = new URLSearchParams();
  if (options?.profileListScope) {
    params.set("scope", options.profileListScope);
  }
  if (options?.openChat) {
    params.set("chat", "1");
  }
  const qs = params.toString();
  const base = `/app/doctor/clients/${encodeURIComponent(userId)}`;
  const hash = options?.hash ? `#${options.hash}` : "";
  return qs ? `${base}?${qs}${hash}` : `${base}${hash}`;
}
