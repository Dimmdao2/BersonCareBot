import type { MetadataRoute } from 'next';
import { PLATFORM_NAME } from '@/config/productSurfaces';
import type { ResolvedSurface } from '@/shared/lib/surface/requestSurface';

export const ADMIN_PWA_MANIFEST_PATH = '/manifest-admin.webmanifest';
export const ADMIN_BROWSER_ICON_32 = '/admin-favicon-32.png';
export const ADMIN_PWA_ICON_192 = '/admin-pwa-icon-192.png';
export const ADMIN_PWA_ICON_512 = '/admin-pwa-icon-512.png';
export const ADMIN_PWA_ICON_MASKABLE_512 = '/admin-pwa-icon-maskable-512.png';
export const ADMIN_PWA_APPLE_TOUCH = '/admin-apple-touch-icon.png';

/**
 * Канон platform-admin manifest; route handler вызывает его с уже резолвленным Host.
 *
 * Own icon set, отдельный от `staffPwaManifest` (Т на белом): владелец 12.09 попросил Т на
 * сплошном чёрном для PWA/apple-touch-слотов admin-поверхности — визуально отличает
 * admin.therapysto.ru от кабинета врача даже на экране установки/homescreen.
 */
export function buildAdminPwaManifest(resolved: ResolvedSurface): MetadataRoute.Manifest {
  if (resolved.surface !== 'platform_admin') {
    throw new Error('admin_manifest_requires_platform_admin_surface');
  }
  return {
    id: '/app-admin',
    name: PLATFORM_NAME,
    short_name: PLATFORM_NAME,
    description: 'Управление платформой: организации, тарифы, операции.',
    start_url: '/app/admin',
    scope: '/app',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#000000',
    theme_color: '#000000',
    lang: 'ru',
    icons: [
      {
        src: ADMIN_PWA_ICON_192,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: ADMIN_PWA_ICON_512,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: ADMIN_PWA_ICON_MASKABLE_512,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
