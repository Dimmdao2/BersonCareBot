import type { Metadata } from 'next';
import { PATIENT_DEFAULT_SURFACE, PLATFORM_NAME } from '@/config/productSurfaces';
import { staffPwaLayoutMetadata } from '@/shared/lib/pwa/staffPwaLayoutMetadata';
import {
  PATIENT_BROWSER_ICON_32,
  PATIENT_PWA_APPLE_TOUCH,
  PATIENT_PWA_ICON_192,
  PATIENT_PWA_ICON_512,
  PATIENT_PWA_MANIFEST_PATH,
} from '@/shared/lib/pwa/patientPwaManifest';
import { surfaceDisplayName, type ResolvedSurface } from './requestSurface';

/**
 * Идентичность поверхности в двух видах, которые её выражают: метаданные документа (заголовок,
 * описание, манифест, иконки, apple-web-app) и видимое имя в интерфейсе.
 *
 * Обе функции вызываются ровно из одного места — корневого layout (`app/layout.tsx`), который берёт
 * уже вычисленный proxy результат. Отдельного «имени для шапки»
 * или «метаданных для staff-зоны» на маршрутах больше нет (TPB-16).
 */

/**
 * Пациентская идентичность. `manifest` объявлен явно и указывает на тот же URL, что и раньше:
 * контракт установленного пациентского приложения (`id`/`scope`/`start_url`) не меняется.
 */
type PatientIconSet = Readonly<{
  icon192: string;
  icon512: string;
  appleTouch: string;
}>;

const therapyGoPatientIcons: PatientIconSet = {
  icon192: PATIENT_PWA_ICON_192,
  icon512: PATIENT_PWA_ICON_512,
  appleTouch: PATIENT_PWA_APPLE_TOUCH,
};

/** Legacy blue clinic identity remains until individual clinic PWA artwork exists. */
const brandedPatientIcons: PatientIconSet = {
  icon192: '/pwa-icon-192.png',
  icon512: '/pwa-icon-512.png',
  appleTouch: '/apple-touch-icon.png',
};

function buildPatientLayoutMetadata(name: string, icons: PatientIconSet): Metadata {
  return {
    title: name,
    manifest: PATIENT_PWA_MANIFEST_PATH,
    description: `Patient web application for ${name}.`,
    icons: {
      icon: [
        { url: PATIENT_BROWSER_ICON_32, sizes: '32x32', type: 'image/png' },
        { url: icons.icon192, sizes: '192x192', type: 'image/png' },
        { url: icons.icon512, sizes: '512x512', type: 'image/png' },
      ],
      shortcut: [{ url: PATIENT_BROWSER_ICON_32, sizes: '32x32', type: 'image/png' }],
      apple: [{ url: icons.appleTouch, sizes: '180x180' }],
    },
    appleWebApp: {
      capable: true,
      title: name,
      statusBarStyle: 'default',
    },
  };
}

export const patientLayoutMetadata = buildPatientLayoutMetadata(
  PATIENT_DEFAULT_SURFACE.name,
  therapyGoPatientIcons,
);

/**
 * Browser metadata for the platform-admin subtree. The owner ruled that platform admins do not
 * install an app, so this child layout clears the root layout's PWA metadata during Next merge.
 */
export const platformAdminLayoutMetadata: Metadata = {
  title: PLATFORM_NAME,
  description: `Панель платформенного администратора ${PLATFORM_NAME}.`,
  manifest: null,
  appleWebApp: null,
  icons: null,
};

/** Метаданные документа для поверхности запроса. */
export function surfaceLayoutMetadata(resolved: ResolvedSurface): Metadata {
  if (resolved.surface === 'staff') return staffPwaLayoutMetadata;
  if (resolved.surface === 'platform_admin') return platformAdminLayoutMetadata;
  const displayName = surfaceDisplayName(resolved);
  if (resolved.surface === 'patient_default') return patientLayoutMetadata;
  return buildPatientLayoutMetadata(displayName, brandedPatientIcons);
}
