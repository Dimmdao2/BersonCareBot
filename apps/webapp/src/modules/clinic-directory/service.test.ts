import { describe, expect, it, vi } from 'vitest';
import { createClinicDirectoryService } from './service';
import type { ClinicDirectoryPort } from './ports';

function buildPort(resolved: string | null): ClinicDirectoryPort {
  return {
    resolveOrganizationIdBySlug: vi.fn(async () => resolved),
    resolveCanonicalSlug: vi.fn(async () => null),
    reserveSlug: vi.fn(async (input) => ({ ok: true as const, slug: input.slug })),
    claimReservedSlug: vi.fn(async (input) => ({ ok: true as const, slug: input.slug })),
    renameSlug: vi.fn(async (input) => ({ ok: true as const, slug: input.reservedSlug })),
  };
}

describe('clinicDirectoryService', () => {
  it('normalizes case/whitespace before calling the port', async () => {
    const port = buildPort('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const service = createClinicDirectoryService(port);

    await expect(service.resolveOrganizationIdBySlug('  Clinic-A  ')).resolves.toBe(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    expect(port.resolveOrganizationIdBySlug).toHaveBeenCalledWith('clinic-a');
  });

  it('fails closed (null, no throw, no DB call) for malformed slug input without leaking why', async () => {
    const port = buildPort('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const service = createClinicDirectoryService(port);

    await expect(service.resolveOrganizationIdBySlug('../../etc/passwd')).resolves.toBeNull();
    await expect(service.resolveOrganizationIdBySlug('clinic a')).resolves.toBeNull();
    await expect(service.resolveOrganizationIdBySlug('')).resolves.toBeNull();
    await expect(service.resolveOrganizationIdBySlug('a'.repeat(200))).resolves.toBeNull();
    expect(port.resolveOrganizationIdBySlug).not.toHaveBeenCalled();
  });

  it('passes through a null resolution unchanged (unknown/unpublished/inactive)', async () => {
    const port = buildPort(null);
    const service = createClinicDirectoryService(port);

    await expect(service.resolveOrganizationIdBySlug('saas-test-clinic-a')).resolves.toBeNull();
  });

  it('normalizes an explicitly confirmed ASCII slug before reserve/claim/rename', async () => {
    const port = buildPort(null);
    const service = createClinicDirectoryService(port);
    const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    await expect(
      service.reserveSlug({
        slug: '  My__Clinic  ',
        organizationId,
      }),
    ).resolves.toEqual({ ok: true, slug: 'my-clinic' });
    await expect(
      service.claimReservedSlug({
        slug: 'MY clinic',
        organizationId,
      }),
    ).resolves.toEqual({ ok: true, slug: 'my-clinic' });
    await expect(
      service.renameSlug({
        organizationId,
        reservedSlug: 'MY clinic',
      }),
    ).resolves.toEqual({ ok: true, slug: 'my-clinic' });

    expect(port.reserveSlug).toHaveBeenCalledWith(expect.objectContaining({ slug: 'my-clinic' }));
    expect(port.claimReservedSlug).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'my-clinic' }),
    );
    expect(port.renameSlug).toHaveBeenCalledWith(
      expect.objectContaining({ reservedSlug: 'my-clinic' }),
    );
  });

  it('rejects reserved routes and non-ASCII writes before the port', async () => {
    const port = buildPort(null);
    const service = createClinicDirectoryService(port);
    const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    await expect(
      service.reserveSlug({
        slug: 'app',
        organizationId,
      }),
    ).resolves.toEqual({ ok: false, code: 'reserved_slug' });
    await expect(
      service.reserveSlug({
        slug: 'клиника',
        organizationId,
      }),
    ).resolves.toEqual({ ok: false, code: 'invalid_slug' });
    expect(port.reserveSlug).not.toHaveBeenCalled();
  });

  it('keeps transliteration suggestion separate from persistence confirmation', () => {
    const service = createClinicDirectoryService(buildPort(null));
    expect(service.suggestSlug('Клиника Доктора Берсона')).toBe('klinika-doktora-bersona');
    expect(service.suggestSlug('API')).toBeNull();
  });

  it('returns a direct canonical target for current/alias resolution without exposing invalid inputs', async () => {
    const port = buildPort(null);
    vi.mocked(port.resolveCanonicalSlug).mockResolvedValue({
      organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      requestedSlug: 'old-clinic',
      canonicalSlug: 'new-clinic',
      disposition: 'redirect',
    });
    const service = createClinicDirectoryService(port);

    await expect(service.resolveCanonicalSlug(' OLD clinic ')).resolves.toEqual(
      expect.objectContaining({ canonicalSlug: 'new-clinic', disposition: 'redirect' }),
    );
    await expect(service.resolveCanonicalSlug('../private')).resolves.toBeNull();
    expect(port.resolveCanonicalSlug).toHaveBeenCalledOnce();
    expect(port.resolveCanonicalSlug).toHaveBeenCalledWith('old-clinic');
  });
});
