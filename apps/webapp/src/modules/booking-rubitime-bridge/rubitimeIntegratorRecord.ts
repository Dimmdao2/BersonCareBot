const NATIVE_BE_INTEGRATOR_RECORD_RE = /^be:[0-9a-fA-F-]{36}$/;

export function isNativeBeIntegratorRecordId(integratorRecordId: string): boolean {
  return NATIVE_BE_INTEGRATOR_RECORD_RE.test(integratorRecordId.trim());
}

export function parseNativeBeAppointmentId(integratorRecordId: string): string | null {
  const trimmed = integratorRecordId.trim();
  if (!NATIVE_BE_INTEGRATOR_RECORD_RE.test(trimmed)) return null;
  return trimmed.slice(3);
}
