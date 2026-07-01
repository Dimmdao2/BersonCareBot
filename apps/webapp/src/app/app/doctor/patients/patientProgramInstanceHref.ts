/** Canonical route to a program instance embedded in the new patient card
 *  (/app/doctor/patients/[userId]/programs/[instanceId]).
 *
 *  Only the query parameters that the target page actually reads and uses are
 *  included here:
 *   - discussionItem  → opens a specific discussion item thread on mount
 *   - focusItemId     → scrolls/focuses a specific test-result row on mount
 *
 *  The old `profileListScope`/`scope` parameter is intentionally omitted: the
 *  new page reads it but does not pass it anywhere — it is vestigial.
 */
export function patientProgramInstanceHref(
  userId: string,
  instanceId: string,
  options?: {
    /** UUID of the discussion item to open on mount. */
    discussionItemId?: string;
    /** UUID of the test-result row to focus on mount. */
    focusItemId?: string;
  },
): string {
  const base = `/app/doctor/patients/${encodeURIComponent(userId)}/programs/${encodeURIComponent(instanceId)}`;
  const params = new URLSearchParams();
  if (options?.discussionItemId) params.set("discussionItem", options.discussionItemId);
  if (options?.focusItemId) params.set("focusItemId", options.focusItemId);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
