import type { Metadata } from 'next';
import { PATIENT_DEFAULT_SURFACE, STAFF_SURFACE } from '@/config/productSurfaces';
import { staffPwaLayoutMetadata } from '@/shared/lib/pwa/staffPwaLayoutMetadata';
import { PATIENT_PWA_MANIFEST_PATH } from '@/shared/lib/pwa/patientPwaManifest';
import type { ResolvedSurface } from './requestSurface';

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
export const patientLayoutMetadata: Metadata = {
  title: PATIENT_DEFAULT_SURFACE.name,
  manifest: PATIENT_PWA_MANIFEST_PATH,
  description: `Patient web application for ${PATIENT_DEFAULT_SURFACE.name}.`,
  icons: {
    icon: [
      { url: '/pwa-icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/pwa-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: [{ url: '/pwa-icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: {
    capable: true,
    title: PATIENT_DEFAULT_SURFACE.name,
    statusBarStyle: 'default',
  },
};

/** Метаданные документа для поверхности запроса. */
export function surfaceLayoutMetadata(resolved: ResolvedSurface): Metadata {
  if (resolved.surface === 'staff' || resolved.surface === 'platform_admin') {
    return staffPwaLayoutMetadata;
  }
  const displayName = surfaceDisplayName(resolved);
  if (resolved.surface === 'patient_default') return patientLayoutMetadata;
  return {
    ...patientLayoutMetadata,
    title: displayName,
    description: `Patient web application for ${displayName}.`,
    appleWebApp: {
      capable: true,
      title: displayName,
      statusBarStyle: 'default',
    },
  };
}

/** Видимое имя продукта для поверхности запроса (шапка, тексты экранов входа). */
export function surfaceDisplayName(resolved: ResolvedSurface): string {
  if (resolved.surface === 'staff' || resolved.surface === 'platform_admin') {
    return STAFF_SURFACE.name;
  }
  if (resolved.surface === 'patient_branded') {
    if (!resolved.effectivePatientBrand) {
      throw new Error('branded_surface_requires_effective_patient_brand');
    }
    return resolved.effectivePatientBrand.effectiveDisplayName;
  }
  return PATIENT_DEFAULT_SURFACE.name;
}
