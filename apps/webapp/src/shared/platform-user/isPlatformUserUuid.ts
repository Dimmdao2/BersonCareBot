/** `platform_users.id` in webapp is UUID; legacy session ids (e.g. `tg:…`) are not. */
export function isPlatformUserUuid(userId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
}
