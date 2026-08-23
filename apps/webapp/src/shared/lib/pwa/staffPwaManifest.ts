import type { MetadataRoute } from 'next';
import { STAFF_SURFACE } from '@/config/productSurfaces';
import type { ResolvedSurface } from '@/shared/lib/surface/requestSurface';

export const STAFF_PWA_MANIFEST_PATH = '/manifest-staff.webmanifest';
export const STAFF_PWA_ICON_192 = '/staff-pwa-icon-192.png';
export const STAFF_PWA_ICON_512 = '/staff-pwa-icon-512.png';
export const STAFF_PWA_APPLE_TOUCH = '/staff-pwa-apple-touch.png';

/** Канон staff manifest; route handler вызывает его с уже резолвленным Host. */
export function buildStaffPwaManifest(resolved: ResolvedSurface): MetadataRoute.Manifest {
  if (resolved.surface !== 'staff' && resolved.surface !== 'platform_admin') {
    throw new Error('staff_manifest_requires_staff_surface');
  }
  return {
    id: '/app-staff',
    name: STAFF_SURFACE.name,
    short_name: STAFF_SURFACE.name,
    description: 'Кабинет врача и администратора: клиенты, расписание, контент, настройки.',
    start_url: '/app/doctor',
    scope: '/app',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    lang: 'ru',
    icons: [
      {
        src: STAFF_PWA_ICON_192,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: STAFF_PWA_ICON_512,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
