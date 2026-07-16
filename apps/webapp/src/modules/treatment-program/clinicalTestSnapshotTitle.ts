function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Resolve the historical title from the immutable instance item snapshot.
 * Patient result reads must not reopen the clinic's live clinical-test catalog.
 */
export function clinicalTestTitleFromInstanceSnapshot(
  snapshot: Record<string, unknown>,
  testId: string,
): string | null {
  const tests = Array.isArray(snapshot.tests) ? snapshot.tests : [];
  for (const candidate of tests) {
    const row = record(candidate);
    if (row?.testId !== testId) continue;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    return title || null;
  }

  if (snapshot.id === testId) {
    const title = typeof snapshot.title === "string" ? snapshot.title.trim() : "";
    return title || null;
  }
  return null;
}
