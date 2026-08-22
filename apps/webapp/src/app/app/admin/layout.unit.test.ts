import { describe, expect, it } from 'vitest';
import { platformAdminLayoutMetadata } from '@/shared/lib/surface/surfaceLayoutMetadata';

describe('platform-admin metadata', () => {
  it('keeps Therapysto in the browser tab without making the platform admin installable', () => {
    expect(platformAdminLayoutMetadata).toMatchObject({
      title: 'Therapysto',
      description: 'Панель платформенного администратора Therapysto.',
    });
    expect(platformAdminLayoutMetadata.manifest).toBeNull();
    expect(platformAdminLayoutMetadata.appleWebApp).toBeNull();
  });
});
