import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SURFACE_AUTH_POLICY_CONFIG,
  type ResolvedSurface,
} from '@/shared/lib/surface/requestSurface';
import { buildPatientPwaManifest, patientPwaIconSet } from './patientPwaManifest';

const APP_ICON_MEDIA_ID = '5f6e7d8c-9a0b-4c1d-8e2f-3a4b5c6d7e8f';

function brandedSurface(appIconMediaId?: string): ResolvedSurface {
  return {
    surface: 'patient_branded',
    publicOrigin: 'https://clinic.example',
    organizationId: '11111111-1111-4111-8111-111111111111',
    clinicSlug: 'clinic',
    effectivePatientBrand: {
      effectiveDisplayName: 'Клиника',
      patientAppName: 'Клиника',
      accentToken: '#284da0',
      ...(appIconMediaId ? { appIconMediaId } : {}),
    },
    authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.patient,
  };
}

/**
 * Поручение владельца 10.09.2026: иконка клиники должна доходить и до установленного приложения,
 * и до фавикона. Здесь проверяется именно ЭТО — что оба потребителя одного шва берут набор
 * клиники, а без иконки остаются на платформенном наборе, а не на пустоте.
 */
describe('иконки брендированной пациентской поверхности', () => {
  it('иконка клиники доходит до всех форматов, включая фавикон и maskable', () => {
    const icons = patientPwaIconSet(brandedSurface(APP_ICON_MEDIA_ID));

    expect(icons).toEqual({
      browserIcon: `/api/brand/app-icon/${APP_ICON_MEDIA_ID}/32.png`,
      browserIconSize: '32x32',
      icon192: `/api/brand/app-icon/${APP_ICON_MEDIA_ID}/192.png`,
      icon512: `/api/brand/app-icon/${APP_ICON_MEDIA_ID}/512.png`,
      maskableIcon512: `/api/brand/app-icon/${APP_ICON_MEDIA_ID}/maskable-512.png`,
      appleTouch: `/api/brand/app-icon/${APP_ICON_MEDIA_ID}/180.png`,
    });

    const manifest = buildPatientPwaManifest(brandedSurface(APP_ICON_MEDIA_ID));
    expect(manifest.icons).toEqual([
      {
        src: `/api/brand/app-icon/${APP_ICON_MEDIA_ID}/192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `/api/brand/app-icon/${APP_ICON_MEDIA_ID}/512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `/api/brand/app-icon/${APP_ICON_MEDIA_ID}/maskable-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ]);
  });

  it('клиника без своей иконки остаётся на платформенном наборе, а не без иконок', () => {
    const icons = patientPwaIconSet(brandedSurface());

    expect(icons.icon192).toBe('/pwa-icon-192.png');
    expect(icons.appleTouch).toBe('/apple-touch-icon.png');
    expect(buildPatientPwaManifest(brandedSurface()).icons?.length).toBeGreaterThan(0);
  });
});
