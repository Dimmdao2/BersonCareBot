import type { MetadataRoute } from 'next';
import { PATIENT_DEFAULT_SURFACE } from '@/config/productSurfaces';

export const PATIENT_PWA_MANIFEST_PATH = '/manifest.webmanifest';

/**
 * Манифест установленного пациентского приложения.
 *
 * Раньше он жил в `app/manifest.ts` — file-based metadata, которую Next вставляет в `<head>` САМ и
 * приоритетнее `metadata.manifest` корневого layout. Пока идентичность объявляли staff-зоны у себя
 * (в дочернем сегменте), это было незаметно; после переезда идентичности в единственную точку
 * (`app/layout.tsx`, TPB-08) file-based манифест перекрывал бы staff-манифест на КАЖДОЙ
 * staff-странице — то есть персонал ставил бы пациентское приложение. Поэтому патиентский манифест
 * стал route handler'ом ровно как staff-ный (`app/manifest-staff.webmanifest/route.ts`), а ссылку
 * `<link rel="manifest">` для обеих поверхностей ставит один резолвер.
 *
 * URL, `id`, `scope`, `start_url` и тексты — байт в байт прежние: контракт уже установленных
 * приложений переезд не трогает.
 */
export function buildPatientPwaManifest(): MetadataRoute.Manifest {
  return {
    id: '/app',
    name: `${PATIENT_DEFAULT_SURFACE.name} — забота о твоём здоровье`,
    short_name: PATIENT_DEFAULT_SURFACE.name,
    description:
      'Мобильный помощник для восстановления и реабилитации: разминки, упражнения, дневник самочувствия, напоминания и полезные материалы.',
    start_url: '/app/patient',
    scope: '/app',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    lang: 'ru',
    icons: [
      {
        src: '/pwa-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
