import { describe, expect, it, vi } from 'vitest';
import { metadata as adminLayoutMetadata } from './layout';

vi.mock('@/app-layer/guards/requireRole', () => ({ requirePlatformOperationsPage: vi.fn() }));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: vi.fn() }));
vi.mock('@/shared/ui/doctor/shell/DoctorWorkspaceShell', () => ({ DoctorWorkspaceShell: vi.fn() }));

describe('platform-admin metadata', () => {
  it('keeps Therapysto in the browser tab without making the platform admin installable', () => {
    expect({
      manifest: adminLayoutMetadata.manifest,
      appleWebApp: adminLayoutMetadata.appleWebApp,
    }).toEqual({ manifest: null, appleWebApp: null });
    expect(adminLayoutMetadata).toMatchObject({
      title: 'Therapysto',
      description: 'Панель платформенного администратора Therapysto.',
    });
  });
});
