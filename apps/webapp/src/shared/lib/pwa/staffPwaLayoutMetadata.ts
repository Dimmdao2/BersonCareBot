import type { Metadata } from 'next';
import {
  STAFF_PWA_APPLE_TOUCH,
  STAFF_PWA_ICON_192,
  STAFF_PWA_ICON_512,
  STAFF_PWA_MANIFEST_PATH,
} from '@/shared/lib/pwa/staffPwaManifest';
import { STAFF_SURFACE } from '@/config/productSurfaces';

/** Metadata для staff layouts (`doctor`, `settings`, `admin`) — отдельный manifest, patient root не трогаем. */
export const staffPwaLayoutMetadata: Metadata = {
  title: STAFF_SURFACE.name,
  /**
   * Без своего описания staff-зоны наследуют корневое пациентское («Patient web application for …»),
   * то есть несут чужую идентичность в выдаче и превью ссылок — тот же класс, что находка F1 аудита
   * (`TPB-08`: staff/admin видят Therapysto).
   */
  description: `Кабинет специалиста и администратора ${STAFF_SURFACE.name}.`,
  manifest: STAFF_PWA_MANIFEST_PATH,
  appleWebApp: {
    capable: true,
    title: STAFF_SURFACE.name,
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: STAFF_PWA_ICON_192, sizes: '192x192', type: 'image/png' },
      { url: STAFF_PWA_ICON_512, sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: STAFF_PWA_APPLE_TOUCH, sizes: '180x180' }],
  },
};
