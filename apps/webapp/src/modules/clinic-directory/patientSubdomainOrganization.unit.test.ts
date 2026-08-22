import { describe, expect, it, vi } from 'vitest';
import { resolvePatientSubdomainOrganization } from './patientSubdomainOrganization';

describe('patient subdomain organization resolution', () => {
  it('resolves a clinic label through the existing public slug resolver', async () => {
    const resolveOrganizationIdBySlug = vi.fn().mockResolvedValue('org-1');

    await expect(
      resolvePatientSubdomainOrganization({ resolveOrganizationIdBySlug }, 'Klinika-1'),
    ).resolves.toEqual({ kind: 'resolved', organizationId: 'org-1', slug: 'klinika-1' });
    expect(resolveOrganizationIdBySlug).toHaveBeenCalledWith('klinika-1');
  });

  it('turns an unknown clinic label into hard 404 without a platform fallback', async () => {
    const resolveOrganizationIdBySlug = vi.fn().mockResolvedValue(null);

    await expect(
      resolvePatientSubdomainOrganization({ resolveOrganizationIdBySlug }, 'unknown-clinic'),
    ).resolves.toEqual({ kind: 'not_found', status: 404 });
  });
});
