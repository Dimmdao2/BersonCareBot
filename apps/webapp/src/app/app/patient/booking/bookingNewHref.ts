import { routePaths } from '@/app-layer/routes/paths';

/** «Запись» (`/app/patient/booking`) с опциональным `cityCode` для city-aware полезных ссылок. */
export function bookingNewHref(cityCode?: string | null): string {
  const code = cityCode?.trim();
  if (!code) return routePaths.bookingNew;
  return `${routePaths.bookingNew}?cityCode=${encodeURIComponent(code)}`;
}
