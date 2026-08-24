import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { canSurfaceEnterRoute, classifySurfaceRoute } from './surfaceRoutes';

const APP_DIR = path.resolve(__dirname, '../app');

const KNOWN_TOP_LEVEL_SEGMENTS = [
  '[clinicSlug]',
  'api',
  'app',
  'book',
  'join',
  'legal',
  'manifest-staff.webmanifest',
  'manifest.webmanifest',
  'styles',
] as const;

function isRouteGroup(name: string): boolean {
  return name.startsWith('(') && name.endsWith(')');
}

function collectPageRoutes(dir: string, routePrefix: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === 'page.tsx') out.push(routePrefix === '' ? '/' : routePrefix);
    if (!entry.isDirectory()) continue;
    if (entry.name === 'api' && routePrefix === '') continue;
    if (entry.name.startsWith('_')) continue;
    collectPageRoutes(
      path.join(dir, entry.name),
      isRouteGroup(entry.name) ? routePrefix : `${routePrefix}/${entry.name}`,
      out,
    );
  }
  return out;
}

const ROUTES = collectPageRoutes(APP_DIR, '', []).sort();

describe('surface route audience', () => {
  it('classifies every real page without choosing a Host surface', () => {
    expect(ROUTES.length).toBeGreaterThan(100);
    expect(ROUTES.filter((route) => classifySurfaceRoute(route) === null)).toEqual([]);
  });

  it('freezes top-level segments so the clinic-slug rule cannot swallow a new tree', () => {
    const segments = readdirSync(APP_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !isRouteGroup(entry.name) && !entry.name.startsWith('_'))
      .map((entry) => entry.name)
      .sort();
    expect(segments).toEqual([...KNOWN_TOP_LEVEL_SEGMENTS].sort());
  });

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
