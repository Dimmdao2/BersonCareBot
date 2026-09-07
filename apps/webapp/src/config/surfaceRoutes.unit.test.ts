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
    expect(canSurfaceEnterRoute('patient_default', '/specialists')).toBe(false);
    expect(canSurfaceEnterRoute('patient_branded', '/specialists')).toBe(false);
    expect(canSurfaceEnterRoute('patient_default', '/app/doctor/login')).toBe(false);
    expect(canSurfaceEnterRoute('patient_branded', '/app/patient/login')).toBe(true);
    expect(canSurfaceEnterRoute('staff', '/app/patient/login')).toBe(false);
    expect(canSurfaceEnterRoute('patient_default', '/book/embed.js')).toBe(true);
    expect(canSurfaceEnterRoute('staff', '/book/embed.js')).toBe(false);
  });
});
