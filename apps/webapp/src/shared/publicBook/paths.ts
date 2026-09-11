export const publicBookPaths = {
  root: '/book',
  new: '/book',
  newService: '/book/service',
  newSlot: '/book/slot',
  newConfirm: '/book/confirm',
  pay: '/book/pay',
  done: '/book/done',
  embedScript: '/book/embed.js',
  /**
   * Канонический адрес записи клиники. Владелец 19.08: «должно быть не domain/booking/clinic,
   * а domain/clinic/booking». Прежний `/book/{slug}` жив как вечный 308-редирект сюда.
   */
  forSlug: (slug: string) => `/${encodeURIComponent(slug)}/booking`,
} as const;

/** Canonical clinic-card path shared by the slug page and Host-based patient routing. */
export function publicClinicCardPath(slug: string): string {
  return `/${encodeURIComponent(slug)}`;
}

/**
 * Адрес публичной страницы специалиста (#926 §17.G).
 *
 * По идентификатору, а не по читаемому слагу: у слага клиники есть целая политика (вечный алиас,
 * лимит самостоятельных смен, `organization_slug_claims`), и второй такой же ради страницы человека
 * преждевременен. Адрес обратим — слаг с редиректом можно добавить позже, не ломая ссылки.
 */
export function publicClinicSpecialistPath(slug: string, specialistId: string): string {
  return `/${encodeURIComponent(slug)}/specialist/${encodeURIComponent(specialistId)}`;
}
