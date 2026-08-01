export const publicBookPaths = {
  root: '/book',
  new: '/book',
  newService: '/book/service',
  newSlot: '/book/slot',
  newConfirm: '/book/confirm',
  pay: '/book/pay',
  done: '/book/done',
  embedScript: '/book/embed.js',
  /** Canonical per-clinic public booking link (`/book/{publicSlug}`, OWNER_RULINGS_2026-07-17.md §1). */
  forSlug: (slug: string) => `/book/${encodeURIComponent(slug)}`,
} as const;
