/**
 * Extract HTTPS URL to manage a Rubitime record from integrator `create-record` JSON body.
 */
export function extractRubitimeManageUrlFromIntegratorCreateRaw(raw: Record<string, unknown>): string | null {
  const tryUrl = (u: unknown): string | null => {
    if (typeof u !== "string" || !u.trim()) return null;
    const t = u.trim();
    if (t.startsWith("http://") || t.startsWith("https://")) return t;
    return null;
  };
  const data = raw.data;
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    const fromData = tryUrl(o.url) ?? tryUrl(o.link) ?? tryUrl(o.record_url);
    if (fromData) return fromData;
  }
  return tryUrl(raw.url) ?? tryUrl(raw.link) ?? null;
}
