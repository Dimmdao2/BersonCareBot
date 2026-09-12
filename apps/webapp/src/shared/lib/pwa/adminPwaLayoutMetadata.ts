import type { Metadata } from 'next';
import {
  ADMIN_BROWSER_ICON_32,
  ADMIN_PWA_APPLE_TOUCH,
  ADMIN_PWA_ICON_192,
  ADMIN_PWA_ICON_512,
  ADMIN_PWA_MANIFEST_PATH,
} from '@/shared/lib/pwa/adminPwaManifest';
import { PLATFORM_NAME } from '@/config/productSurfaces';

/**
 * Metadata для `platform_admin` (admin.therapysto.ru). Владелец 12.09 отменил прежнее правило
 * «админы не ставят приложение» (см. историю `surfaceLayoutMetadata.ts`) — теперь у admin-зоны
 * свой manifest и свой icon-набор (Т на чёрном), отдельный от staff (`staffPwaLayoutMetadata`,
 * Т на белом) и patient.
 */
export const adminPwaLayoutMetadata: Metadata = {
  title: PLATFORM_NAME,
  description: `Панель платформенного администратора ${PLATFORM_NAME}.`,
  manifest: ADMIN_PWA_MANIFEST_PATH,
  appleWebApp: {
    capable: true,
    title: PLATFORM_NAME,
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: ADMIN_BROWSER_ICON_32, sizes: '32x32', type: 'image/png' },
      { url: ADMIN_PWA_ICON_192, sizes: '192x192', type: 'image/png' },
      { url: ADMIN_PWA_ICON_512, sizes: '512x512', type: 'image/png' },
    ],
    shortcut: [{ url: ADMIN_BROWSER_ICON_32, sizes: '32x32', type: 'image/png' }],
    apple: [{ url: ADMIN_PWA_APPLE_TOUCH, sizes: '180x180' }],
  },
};
