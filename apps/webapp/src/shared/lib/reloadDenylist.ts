const DENY_PREFIXES = ["/app/patient/test", "/app/patient/tests", "/app/doctor/editor"];

export function isReloadDeniedPath(pathname: string): boolean {
  return DENY_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
