import { describe, expect, it, vi } from 'vitest';
import { adminPwaLayoutMetadata } from '@/shared/lib/pwa/adminPwaLayoutMetadata';
import { ADMIN_PWA_MANIFEST_PATH } from '@/shared/lib/pwa/adminPwaManifest';
import { staffPwaLayoutMetadata } from '@/shared/lib/pwa/staffPwaLayoutMetadata';
import { metadata as adminLayoutMetadata } from './layout';

vi.mock('@/app-layer/guards/requireRole', () => ({ requirePlatformOperationsPage: vi.fn() }));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: vi.fn() }));
vi.mock('@/shared/ui/doctor/shell/DoctorWorkspaceShell', () => ({ DoctorWorkspaceShell: vi.fn() }));

/**
 * Это ЕДИНСТВЕННОЕ место в репозитории, где проверяется идентичность admin-зоны: ни
 * `surfaceLayoutMetadata`, ни `platformAdminLayoutMetadata` своего набора не имеют. Поэтому набор
 * держит не «какой title», а сам шов — что layout отдаёт admin-метаданные, а не наследует
 * staff-набор и не обнуляет манифест.
 *
 * Владелец 12.09.2026 отменил прежнее правило «админы приложение не ставят»: у admin-зоны свой
 * manifest и свой icon-набор (Т на чёрном), отдельный от staff и patient. До этой правки набор
 * здесь утверждал ОТМЕНЁННОЕ — `manifest: null, appleWebApp: null`.
 */
describe('platform-admin metadata', () => {
  it('gives the platform admin its own installable identity instead of the staff or an empty one', () => {
    expect(adminLayoutMetadata).toBe(adminPwaLayoutMetadata);
    expect(adminLayoutMetadata).not.toBe(staffPwaLayoutMetadata);
    expect(adminLayoutMetadata.manifest).toBe(ADMIN_PWA_MANIFEST_PATH);
    expect(adminLayoutMetadata.appleWebApp).toMatchObject({ capable: true, title: 'Therapysto' });
    expect(adminLayoutMetadata).toMatchObject({
      title: 'Therapysto',
      description: 'Панель платформенного администратора Therapysto.',
    });
  });
});
