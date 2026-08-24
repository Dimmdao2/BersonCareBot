import { describe, expect, it } from 'vitest';
import { metadata as legalLayoutMetadata } from '@/app/legal/layout';
import { buildPatientPwaManifest } from './patientPwaManifest';
import { PATIENT_DEFAULT_SURFACE, STAFF_SURFACE } from '@/config/productSurfaces';
import { LEGAL_DOCUMENT_OPERATOR, legalDocumentMetadata } from '@/config/legalDocumentOperator';
import { staffPwaLayoutMetadata } from './staffPwaLayoutMetadata';
import { buildStaffPwaManifest, STAFF_PWA_MANIFEST_PATH } from './staffPwaManifest';
import {
  DEFAULT_SURFACE_AUTH_POLICY_CONFIG,
  surfaceDisplayName,
  surfaceAccentToken,
  type ResolvedSurface,
} from '@/shared/lib/surface/requestSurface';
import { surfaceLayoutMetadata } from '@/shared/lib/surface/surfaceLayoutMetadata';

const STAFF_RESOLVED: ResolvedSurface = {
  surface: 'staff',
  publicOrigin: STAFF_SURFACE.origin,
  authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.staff,
};

const PATIENT_RESOLVED: ResolvedSurface = {
  surface: 'patient_default',
  publicOrigin: PATIENT_DEFAULT_SURFACE.origin,
  authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.patient,
};

const BRANDED_RESOLVED: ResolvedSurface = {
  surface: 'patient_branded',
  publicOrigin: 'https://clinic-a.therapygo.ru',
  organizationId: '11111111-1111-4111-8111-111111111111',
  effectivePatientBrand: {
    effectiveDisplayName: 'Clinic A Plus',
    patientAppName: 'Clinic A Care',
    accentToken: '#7a3cc2',
  },
  authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.patient,
};

describe('staff PWA identity', () => {
  it('exposes Therapysto in the installed app and staff document metadata', () => {
    expect(buildStaffPwaManifest(STAFF_RESOLVED)).toMatchObject({
      name: 'Therapysto',
      short_name: 'Therapysto',
    });
    expect(staffPwaLayoutMetadata).toMatchObject({
      title: 'Therapysto',
      appleWebApp: { title: 'Therapysto' },
    });
  });

  it('gives both legal documents one complete platform identity', () => {
    expect(LEGAL_DOCUMENT_OPERATOR.requisites).toEqual({
      legalEntityName: '',
      registeredAddress: '',
      inn: '',
      ogrn: '',
    });
    expect(legalLayoutMetadata).toBe(legalDocumentMetadata);
    expect(legalLayoutMetadata).toMatchObject({
      title: LEGAL_DOCUMENT_OPERATOR.productName,
      manifest: STAFF_PWA_MANIFEST_PATH,
      appleWebApp: { title: LEGAL_DOCUMENT_OPERATOR.productName },
    });
  });
});

/**
 * `id`/`scope`/`start_url` — контракт УЖЕ установленного приложения: браузер сопоставляет обновлённый
 * манифест с установленной иконкой по `id`, а `scope`/`start_url` решают, откроется ли она как
 * приложение. Их смена осиротит установку у каждого, кто уже поставил PWA, поэтому переименование
 * поверхности (TPB-01/TPB-03/TPB-15) обязано менять только имена.
 */
describe('installed PWA contract survives the surface rename', () => {
  it('keeps the patient installation identity and only renames it', () => {
    expect(buildPatientPwaManifest(PATIENT_RESOLVED)).toMatchObject({
      id: '/app',
      scope: '/app',
      start_url: '/app/patient',
      name: `${PATIENT_DEFAULT_SURFACE.name} — забота о твоём здоровье`,
      short_name: PATIENT_DEFAULT_SURFACE.name,
    });
  });

  it('uses the branded Host resolve for the patient manifest identity', () => {
    expect(buildPatientPwaManifest(BRANDED_RESOLVED)).toMatchObject({
      name: 'Clinic A Care — забота о твоём здоровье',
      short_name: 'Clinic A Care',
      start_url: '/app/patient',
    });
    expect(surfaceLayoutMetadata(BRANDED_RESOLVED)).toMatchObject({
      title: 'Clinic A Care',
      manifest: '/manifest.webmanifest',
      icons: {
        icon: [{ url: '/pwa-icon-192.png' }, { url: '/pwa-icon-512.png' }],
        apple: [{ url: '/apple-touch-icon.png' }],
      },
      appleWebApp: { title: 'Clinic A Care' },
    });
    expect(surfaceAccentToken(BRANDED_RESOLVED)).toBe('#7a3cc2');
    expect(surfaceAccentToken(PATIENT_RESOLVED)).toBe('#284da0');
  });

  it('keeps the staff installation identity separate from the patient one', () => {
    const staff = buildStaffPwaManifest(STAFF_RESOLVED);
    expect(staff).toMatchObject({
      id: '/app-staff',
      scope: '/app',
      start_url: '/app/doctor',
      name: STAFF_SURFACE.name,
      short_name: STAFF_SURFACE.name,
    });
    expect(staff.id).not.toBe(buildPatientPwaManifest(PATIENT_RESOLVED).id);
  });
});

/**
 * `TPB-08`: брендинг клиники влияет ТОЛЬКО на пациентскую поверхность. До этого блока обе
 * staff-проверки выше читали константу `staffPwaLayoutMetadata` напрямую, поэтому подмена ветки
 * в самом `surfaceLayoutMetadata`/`surfaceDisplayName` (staff уходит в пациентскую идентичность
 * или подхватывает бренд арендатора) оставалась зелёной. Здесь спрашиваем именно резолвер.
 */
describe('TPB-08: бренд арендатора не пересекает границу поверхности', () => {
  const PLATFORM_ADMIN_RESOLVED: ResolvedSurface = {
    surface: 'platform_admin',
    publicOrigin: STAFF_SURFACE.origin,
    authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.platform_admin,
  };

  /** Брендированный арендатор «дотянулся» до staff-запроса — имя обязано остаться платформенным. */
  const STAFF_WITH_TENANT_BRAND: ResolvedSurface = {
    ...STAFF_RESOLVED,
    organizationId: BRANDED_RESOLVED.organizationId,
    effectivePatientBrand: BRANDED_RESOLVED.effectivePatientBrand,
  };

  it.each([
    ['staff', STAFF_RESOLVED],
    ['platform_admin', PLATFORM_ADMIN_RESOLVED],
    ['staff с брендом арендатора в запросе', STAFF_WITH_TENANT_BRAND],
  ])('%s видит Therapysto в метаданных документа и в имени поверхности', (_label, resolved) => {
    expect(surfaceDisplayName(resolved)).toBe(STAFF_SURFACE.name);
    expect(surfaceLayoutMetadata(resolved)).toMatchObject({
      title: STAFF_SURFACE.name,
      manifest: STAFF_PWA_MANIFEST_PATH,
      appleWebApp: { title: STAFF_SURFACE.name },
    });
    const serialized = JSON.stringify(surfaceLayoutMetadata(resolved));
    expect(serialized).not.toContain(PATIENT_DEFAULT_SURFACE.name);
    expect(serialized).not.toContain('Clinic A Care');
  });

  it('пациентские поверхности при этом НЕ показывают имя staff-платформы', () => {
    for (const resolved of [PATIENT_RESOLVED, BRANDED_RESOLVED]) {
      expect(JSON.stringify(surfaceLayoutMetadata(resolved))).not.toContain(STAFF_SURFACE.name);
    }
  });
});
