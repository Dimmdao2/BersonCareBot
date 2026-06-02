/** Ссылки на экран инстанса программы с сохранением scope и опциональным открытием обсуждения элемента. */
export function doctorClientTreatmentProgramInstanceHref(
  userId: string,
  instanceId: string,
  options?: { profileListScope?: string; discussionItemId?: string; focusItemId?: string },
): string {
  const params = new URLSearchParams();
  if (options?.profileListScope) {
    params.set("scope", options.profileListScope);
  }
  if (options?.discussionItemId) {
    params.set("discussionItem", options.discussionItemId);
  }
  if (options?.focusItemId) {
    params.set("focusItemId", options.focusItemId);
  }
  const qs = params.toString();
  const base = `/app/doctor/clients/${encodeURIComponent(userId)}/treatment-programs/${encodeURIComponent(instanceId)}`;
  return qs ? `${base}?${qs}` : base;
}
