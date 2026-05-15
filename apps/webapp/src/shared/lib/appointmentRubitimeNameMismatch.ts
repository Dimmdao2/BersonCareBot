/**
 * Compare Rubitime record client name vs platform profile label for doctor appointment UI.
 * Pure string helpers — no DB imports.
 */

export function normalizeClientNameForCompare(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = s.trim();
  if (t === "") return null;
  return t.replace(/\s+/g, " ");
}

/**
 * When both sides have a non-empty name and they differ after normalization, return the
 * Rubitime-side string for display (single trim; internal whitespace preserved except edges).
 */
export function rubitimeNameIfDifferent(
  profileLabel: string | null | undefined,
  rubitimeName: string | null | undefined,
): string | null {
  const p = normalizeClientNameForCompare(profileLabel);
  const r = normalizeClientNameForCompare(rubitimeName);
  if (p == null || r == null) return null;
  if (p === r) return null;
  const display = typeof rubitimeName === "string" ? rubitimeName.trim() : "";
  return display.length > 0 ? display : null;
}
