import { describe, expect, it } from 'vitest';
import { canSurfaceEnterRoute, classifySurfaceRoute } from './surfaceRoutes';

describe('surface route audience', () => {
  it.each([
    ['/', 'shared'],
    ['/app', 'shared'],
    ['/legal/terms', 'shared'],
    ['/app/contact-support', 'shared'],
    ['/app/doctor/login', 'staff'],
    ['/app/admin/system-health', 'staff'],
    ['/specialists', 'staff'],
    ['/app/patient/login', 'patient'],
    ['/book/clinic-a', 'patient'],
    ['/clinic-a', 'patient'],
    ['/clinic-a/media/hero', 'patient'],
  ] as const)('classifies %s as %s', (pathname, expected) => {
    expect(classifySurfaceRoute(pathname)).toBe(expected);
  });

  it('uses pathname only as an access constraint after Host was resolved', () => {
    expect(canSurfaceEnterRoute('staff', '/')).toBe(true);
    expect(canSurfaceEnterRoute('patient_default', '/')).toBe(true);
    expect(canSurfaceEnterRoute('patient_branded', '/')).toBe(true);
    expect(canSurfaceEnterRoute('staff', '/app/doctor/login')).toBe(true);
    expect(canSurfaceEnterRoute('staff', '/app/doctor/register')).toBe(true);
    expect(canSurfaceEnterRoute('patient_default', '/app/doctor/register')).toBe(false);
    expect(canSurfaceEnterRoute('patient_default', '/specialists')).toBe(false);
    expect(canSurfaceEnterRoute('patient_branded', '/specialists')).toBe(false);
    expect(canSurfaceEnterRoute('patient_default', '/app/doctor/login')).toBe(false);
    expect(canSurfaceEnterRoute('patient_branded', '/app/patient/login')).toBe(true);
    expect(canSurfaceEnterRoute('staff', '/app/patient/login')).toBe(false);
    expect(canSurfaceEnterRoute('patient_default', '/book/embed.js')).toBe(true);
    expect(canSurfaceEnterRoute('staff', '/book/embed.js')).toBe(false);
    expect(canSurfaceEnterRoute('platform_admin', '/manifest-admin.webmanifest')).toBe(true);
    expect(canSurfaceEnterRoute('staff', '/manifest-admin.webmanifest')).toBe(false);
    expect(canSurfaceEnterRoute('patient_default', '/manifest-admin.webmanifest')).toBe(false);
  });

  /**
   * Страница заявки существует (`app/[clinicSlug]/lead/page.tsx`) и её адрес — тот самый, который
   * виджет даёт человеку. Пока правила для него не было, обе пациентские поверхности отвечали на
   * него 404: живая приёмка Л4 на TEST упёрлась именно в это и до формы не дошла.
   */
  it('lets a patient reach the clinic lead form the widget sends them to', () => {
    expect(canSurfaceEnterRoute('patient_branded', '/clinic-a/lead')).toBe(true);
    expect(canSurfaceEnterRoute('patient_default', '/clinic-a/lead')).toBe(true);
    expect(canSurfaceEnterRoute('staff', '/clinic-a/lead')).toBe(false);
    expect(canSurfaceEnterRoute('platform_admin', '/clinic-a/lead')).toBe(false);
  });

  it('opens nothing deeper than the clinic pages it names', () => {
    expect(canSurfaceEnterRoute('patient_branded', '/clinic-a/lead/extra')).toBe(false);
    expect(canSurfaceEnterRoute('patient_branded', '/clinic-a/leads')).toBe(false);
  });
});
