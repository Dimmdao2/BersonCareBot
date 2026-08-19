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
