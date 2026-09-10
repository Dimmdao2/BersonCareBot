import type { MetadataRoute } from 'next';
import { surfaceDisplayName, type ResolvedSurface } from '@/shared/lib/surface/requestSurface';
import { isOrgAppIconMediaId, orgAppIconUrl } from '@/shared/lib/brand/orgAppIcon';

export const PATIENT_PWA_MANIFEST_PATH = '/manifest.webmanifest';
export const PATIENT_BROWSER_ICON_32 = '/therapygo-favicon-32.png';
export const PATIENT_PWA_ICON_192 = '/therapygo-pwa-icon-192.png';
export const PATIENT_PWA_ICON_512 = '/therapygo-pwa-icon-512.png';
export const PATIENT_PWA_ICON_MASKABLE_512 = '/therapygo-pwa-icon-maskable-512.png';
export const PATIENT_PWA_APPLE_TOUCH = '/therapygo-apple-touch-icon.png';

export type PatientPwaIconSet = Readonly<{
  browserIcon: string;
  browserIconSize: string;
  icon192: string;
  icon512: string;
  appleTouch: string;
  maskableIcon512?: string;
}>;

export const PATIENT_DEFAULT_PWA_ICON_SET: PatientPwaIconSet = {
  browserIcon: PATIENT_BROWSER_ICON_32,
  browserIconSize: '32x32',
  icon192: PATIENT_PWA_ICON_192,
  icon512: PATIENT_PWA_ICON_512,
  maskableIcon512: PATIENT_PWA_ICON_MASKABLE_512,
  appleTouch: PATIENT_PWA_APPLE_TOUCH,
};

/**
 * Набор брендированной поверхности, пока клиника НЕ поставила свою иконку. Это исторические
 * синие ассеты; они остаются именно фолбэком (§10 контракта бренда: непригодный ассет
 * деградирует к платформенному набору, а не к пустоте).
 */
const brandedPatientPwaIconsFallback: PatientPwaIconSet = {
  browserIcon: '/pwa-icon-192.png',
  browserIconSize: '192x192',
  icon192: '/pwa-icon-192.png',
  icon512: '/pwa-icon-512.png',
  appleTouch: '/apple-touch-icon.png',
};

/**
 * Набор иконок клиники из ОДНОГО валидированного media id (владелец 10.09.2026, вариант A).
 * Адреса строит только сервер по общему словарю размеров, поэтому набор не может разъехаться с
 * тем, что реально сгенерировано при сохранении.
 */
function clinicPatientPwaIcons(appIconMediaId: string): PatientPwaIconSet {
  return {
    browserIcon: orgAppIconUrl(appIconMediaId, '32'),
    browserIconSize: '32x32',
    icon192: orgAppIconUrl(appIconMediaId, '192'),
    icon512: orgAppIconUrl(appIconMediaId, '512'),
    maskableIcon512: orgAppIconUrl(appIconMediaId, 'maskable-512'),
    appleTouch: orgAppIconUrl(appIconMediaId, '180'),
  };
}

/** The one patient icon-set boundary for both the manifest and document metadata. */
export function patientPwaIconSet(resolved: ResolvedSurface): PatientPwaIconSet {
  if (resolved.surface === 'patient_default') return PATIENT_DEFAULT_PWA_ICON_SET;
  if (resolved.surface !== 'patient_branded') {
    throw new Error('patient_icon_set_requires_patient_surface');
  }
  // Бренд уже прошёл санитайзер поверхности: id либо валидный uuid, либо его нет вовсе.
  const appIconMediaId = resolved.effectivePatientBrand?.appIconMediaId;
  return appIconMediaId && isOrgAppIconMediaId(appIconMediaId)
    ? clinicPatientPwaIcons(appIconMediaId)
    : brandedPatientPwaIconsFallback;
}

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
export function buildPatientPwaManifest(resolved: ResolvedSurface): MetadataRoute.Manifest {
  if (resolved.surface !== 'patient_default' && resolved.surface !== 'patient_branded') {
    throw new Error('patient_manifest_requires_patient_surface');
  }
  const displayName = surfaceDisplayName(resolved);
  const icons = patientPwaIconSet(resolved);
  return {
    id: '/app',
    name: `${displayName} — забота о твоём здоровье`,
    short_name: displayName,
    description:
      'Мобильный помощник для восстановления и реабилитации: разминки, упражнения, дневник самочувствия, напоминания и полезные материалы.',
    start_url: '/app/patient',
    scope: '/app',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    lang: 'ru',
    icons: [
      {
        src: icons.icon192,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: icons.icon512,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      ...(icons.maskableIcon512
        ? [
            {
              src: icons.maskableIcon512,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable' as const,
            },
          ]
        : []),
    ],
  };
}
