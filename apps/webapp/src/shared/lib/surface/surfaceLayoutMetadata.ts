import type { Metadata } from 'next';
import { PATIENT_DEFAULT_SURFACE } from '@/config/productSurfaces';
import { staffPwaLayoutMetadata } from '@/shared/lib/pwa/staffPwaLayoutMetadata';
import { adminPwaLayoutMetadata } from '@/shared/lib/pwa/adminPwaLayoutMetadata';
import {
  PATIENT_DEFAULT_PWA_ICON_SET,
  PATIENT_PWA_MANIFEST_PATH,
  patientPwaIconSet,
  type PatientPwaIconSet,
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
function buildPatientLayoutMetadata(
  name: string,
  icons: PatientPwaIconSet,
  publicOrigin?: string,
): Metadata {
  // Картинка превью ссылки — тот же знак, что стоит на вкладке и на установленном приложении, и
  // берётся он с той же ПУБЛИЧНОЙ двери (`/api/brand/app-icon/...`): ссылку разворачивает робот
  // мессенджера, у которого сессии нет и быть не может. Адрес абсолютный — относительный робот не
  // разрешит. Раньше превью не было вовсе: ссылка на клинику приходила в мессенджер без картинки.
  const shareImage = absoluteOrNull(icons.icon512, publicOrigin);
  return {
    title: name,
    manifest: PATIENT_PWA_MANIFEST_PATH,
    description: `Patient web application for ${name}.`,
    ...(shareImage
      ? {
          openGraph: {
            title: name,
            siteName: name,
            type: 'website' as const,
            images: [{ url: shareImage, width: 512, height: 512, alt: `Знак ${name}` }],
          },
          twitter: { card: 'summary' as const, title: name, images: [shareImage] },
        }
      : {}),
    icons: {
      icon: [
        { url: icons.browserIcon, sizes: icons.browserIconSize, type: 'image/png' },
        { url: icons.icon192, sizes: '192x192', type: 'image/png' },
        { url: icons.icon512, sizes: '512x512', type: 'image/png' },
      ],
      shortcut: [{ url: icons.browserIcon, sizes: icons.browserIconSize, type: 'image/png' }],
      apple: [{ url: icons.appleTouch, sizes: '180x180' }],
    },
    appleWebApp: {
      capable: true,
      title: name,
      statusBarStyle: 'default',
    },
  };
}

/** Абсолютный адрес для робота превью; без надёжного origin картинку не заявляем вовсе. */
function absoluteOrNull(path: string, origin: string | undefined): string | null {
  if (!origin) return null;
  try {
    return new URL(path, origin).toString();
  } catch {
    return null;
  }
}

export const patientLayoutMetadata = buildPatientLayoutMetadata(
  PATIENT_DEFAULT_SURFACE.name,
  PATIENT_DEFAULT_PWA_ICON_SET,
  PATIENT_DEFAULT_SURFACE.origin,
);

/**
 * Browser metadata for the platform-admin subtree (admin.therapysto.ru).
 *
 * Historical note: this used to clear the root layout's PWA metadata entirely (`manifest: null,
 * icons: null`) under an earlier ruling that platform admins do not install an app. Владелец 12.09
 * отменил это решение — теперь admin получает свой manifest и свой icon-набор (Т на чёрном,
 * отдельный от staff/patient) через {@link adminPwaLayoutMetadata}.
 */
export const platformAdminLayoutMetadata: Metadata = adminPwaLayoutMetadata;

/** Метаданные документа для поверхности запроса. */
export function surfaceLayoutMetadata(resolved: ResolvedSurface): Metadata {
  if (resolved.surface === 'staff') return staffPwaLayoutMetadata;
  if (resolved.surface === 'platform_admin') return platformAdminLayoutMetadata;
  const displayName = surfaceDisplayName(resolved);
  if (resolved.surface === 'patient_default') return patientLayoutMetadata;
  return buildPatientLayoutMetadata(displayName, patientPwaIconSet(resolved), resolved.publicOrigin);
}
