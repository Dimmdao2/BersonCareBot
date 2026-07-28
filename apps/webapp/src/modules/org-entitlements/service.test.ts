import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { OrgEntitlementsPort } from './ports';
import {
  createPlatformEntitlementsService,
  isMechanicEnabled,
  resolveClinicSeatLimit,
  resolveOrgEntitlements,
  resolveOrgQuotaProjections,
} from './service';
import { MECHANIC_REGISTRY, MECHANICS, QUOTA_UNIT_LABELS } from './types';

function portFor(
  tariff: { mechanics: Record<string, boolean>; includedSeats?: number | null } | null,
  overrides: {
    mechanic: string;
    enabled: boolean;
    seatLimitOverride?: number | null;
    expiresAt?: string | null;
  }[],
): OrgEntitlementsPort {
  const port: OrgEntitlementsPort = {
    getSnapshot: vi.fn(async () => ({
      tariff: tariff
        ? { mechanics: tariff.mechanics, quotas: {}, includedSeats: tariff.includedSeats ?? null }
        : null,
      overrides: overrides.map((override) => ({
        ...override,
        quota: null,
        expiresAt: override.expiresAt ?? null,
        seatLimitOverride: override.seatLimitOverride ?? null,
      })),
      access: { lifecycle: 'active' as const, tariffId: null, source: 'compatibility' as const },
    })),
    getTariffForOrg: vi.fn(async () =>
      tariff ? { mechanics: tariff.mechanics, includedSeats: tariff.includedSeats ?? null } : null,
    ),
    listOverrides: vi.fn(async () =>
      overrides.map((override) => ({
        ...override,
        seatLimitOverride: override.seatLimitOverride ?? null,
      })),
    ),
    getEffectiveCommercialAccess: vi.fn(async () => ({
      lifecycle: 'active' as const,
      tariffId: null,
      source: 'compatibility' as const,
    })),
    getEnforcedQuotaUsage: vi.fn(async () => ({})),
  };
  return port;
}

describe('resolveOrgEntitlements', () => {
  it('defaults compatibility mechanics to enabled but paid capabilities to disabled without tariff or overrides', async () => {
    const result = await resolveOrgEntitlements(portFor(null, []), 'legacy-org');
    for (const mechanic of MECHANICS) {
      if (mechanic === 'clinic_team' || mechanic === 'courses' || mechanic === 'exercise_catalog')
        continue;
      expect(result[mechanic]).toBe(true);
    }
    expect(result.clinic_team).toBe(false);
    expect(result.courses).toBe(false);
    expect(result.exercise_catalog).toBe(false);
  });

  it('enables clinic_team once a tariff explicitly turns it on', async () => {
    const result = await resolveOrgEntitlements(
      portFor({ mechanics: { clinic_team: true } }, []),
      'org-a',
    );
    expect(result.clinic_team).toBe(true);
  });

  it('lets an org override enable clinic_team with no tariff', async () => {
    const result = await resolveOrgEntitlements(
      portFor(null, [{ mechanic: 'clinic_team', enabled: true }]),
      'org-a',
    );
    expect(result.clinic_team).toBe(true);
  });

  it('uses assigned tariff values', async () => {
    const result = await resolveOrgEntitlements(
      portFor({ mechanics: { courses: false } }, []),
      'org-a',
    );
    expect(result.courses).toBe(false);
  });

  it('lets an organization override win over an assigned tariff', async () => {
    const result = await resolveOrgEntitlements(
      portFor({ mechanics: { courses: false } }, [{ mechanic: 'courses', enabled: true }]),
      'org-a',
    );
    expect(result.courses).toBe(true);
  });

  it('ignores an expired organization override', async () => {
    const result = await resolveOrgEntitlements(
      portFor({ mechanics: { courses: false } }, [
        { mechanic: 'courses', enabled: true, expiresAt: '2020-01-01T00:00:00.000Z' },
      ]),
      'org-a',
    );
    expect(result.courses).toBe(false);
  });

  it('keeps courses fail-closed for an unassigned organization', async () => {
    const result = await resolveOrgEntitlements(portFor(null, []), 'legacy-org');
    expect(result.courses).toBe(false);
  });

  it('fails closed for a provisioned no-trial organization instead of applying compatibility defaults', async () => {
    const port = portFor(null, []);
    port.getEffectiveCommercialAccess = vi.fn(async () => ({
      lifecycle: 'active' as const,
      tariffId: null,
      source: 'no_trial' as const,
    }));
    const result = await resolveOrgEntitlements(port, 'new-org-without-trial-policy');
    expect(Object.values(result)).not.toContain(true);
  });

  it('does not leak an override from organization A into organization B', async () => {
    const ports = new Map<string, OrgEntitlementsPort>([
      ['org-a', portFor(null, [{ mechanic: 'courses', enabled: true }])],
      ['org-b', portFor(null, [])],
    ]);
    const scopedPort: OrgEntitlementsPort = {
      getSnapshot: (organizationId) => ports.get(organizationId)!.getSnapshot(organizationId),
      getTariffForOrg: (organizationId) =>
        ports.get(organizationId)!.getTariffForOrg(organizationId),
      listOverrides: (organizationId) => ports.get(organizationId)!.listOverrides(organizationId),
      getEffectiveCommercialAccess: (organizationId) =>
        ports.get(organizationId)!.getEffectiveCommercialAccess(organizationId),
      getEnforcedQuotaUsage: (organizationId) =>
        ports.get(organizationId)!.getEnforcedQuotaUsage(organizationId),
    };
    await expect(isMechanicEnabled(scopedPort, 'org-a', 'courses')).resolves.toBe(true);
    await expect(isMechanicEnabled(scopedPort, 'org-b', 'courses')).resolves.toBe(false);
  });
});

describe('resolveOrgQuotaProjections', () => {
  it('exposes enforced snapshot quotas, including specialist seats configured outside the generic quota map', async () => {
    const port = portFor({ mechanics: { courses: true, cms_pages: true } }, []);
    port.getSnapshot = vi.fn(async () => ({
      tariff: {
        mechanics: { courses: true, cms_pages: true, clinic_team: true },
        quotas: {
          courses: {
            kind: 'numeric' as const,
            limit: 5,
            unit: 'items',
            period: 'snapshot' as const,
            usagePolicy: 'snapshot' as const,
          },
          cms_pages: {
            kind: 'numeric' as const,
            limit: 10,
            unit: 'items',
            period: 'snapshot' as const,
            usagePolicy: 'snapshot' as const,
          },
        },
        includedSeats: 5,
      },
      overrides: [],
      access: { lifecycle: 'active' as const, tariffId: 'tariff-a', source: 'assignment' as const },
    }));
    port.getEnforcedQuotaUsage = vi.fn(async () => ({ courses: 4, cms_pages: 3, clinic_team: 5 }));
    await expect(resolveOrgQuotaProjections(port, 'org-a')).resolves.toEqual([
      expect.objectContaining({
        mechanic: 'courses',
        usage: 4,
        threshold: 'warning',
        enforcement: 'atomic_snapshot',
      }),
      expect.objectContaining({
        mechanic: 'cms_pages',
        usage: 3,
        threshold: 'below_warning',
        enforcement: 'atomic_snapshot',
      }),
      expect.objectContaining({
        mechanic: 'clinic_team',
        usage: 5,
        threshold: 'reached',
        enforcement: 'application_transaction_snapshot',
      }),
    ]);
  });
});

describe('isMechanicEnabled', () => {
  it('delegates to the same compatibility resolver', async () => {
    const port = portFor(null, [{ mechanic: 'files', enabled: false }]);
    await expect(isMechanicEnabled(port, 'org-1', 'files')).resolves.toBe(false);
    await expect(isMechanicEnabled(port, 'org-1', 'cms_pages')).resolves.toBe(true);
  });
});

describe('resolveClinicSeatLimit', () => {
  it('returns 0 when there is no tariff and no override (clinic_team defaults off)', async () => {
    await expect(resolveClinicSeatLimit(portFor(null, []), 'org-a')).resolves.toBe(0);
  });

  it('returns the fail-closed baseline when clinic_team is enabled but no seat count is configured', async () => {
    const port = portFor({ mechanics: { clinic_team: true } }, []);
    await expect(resolveClinicSeatLimit(port, 'org-a')).resolves.toBe(1);
  });

  it('returns 0 when a tariff sets includedSeats but does not enable clinic_team', async () => {
    const port = portFor({ mechanics: { clinic_team: false }, includedSeats: 5 }, []);
    await expect(resolveClinicSeatLimit(port, 'org-a')).resolves.toBe(0);
  });

  it("uses the tariff's includedSeats when there is no override", async () => {
    const port = portFor({ mechanics: { clinic_team: true }, includedSeats: 3 }, []);
    await expect(resolveClinicSeatLimit(port, 'org-a')).resolves.toBe(3);
  });

  it('lets an org-level seat override win over the tariff value', async () => {
    const port = portFor({ mechanics: { clinic_team: true }, includedSeats: 3 }, [
      { mechanic: 'clinic_team', enabled: true, seatLimitOverride: 7 },
    ]);
    await expect(resolveClinicSeatLimit(port, 'org-a')).resolves.toBe(7);
  });

  it('ignores an override row for an unrelated mechanic', async () => {
    const port = portFor({ mechanics: { clinic_team: true }, includedSeats: 3 }, [
      { mechanic: 'courses', enabled: false, seatLimitOverride: 99 },
    ]);
    await expect(resolveClinicSeatLimit(port, 'org-a')).resolves.toBe(3);
  });

  it('lets an org override disable clinic_team even when the tariff enables it, returning 0', async () => {
    const port = portFor({ mechanics: { clinic_team: true }, includedSeats: 3 }, [
      { mechanic: 'clinic_team', enabled: false },
    ]);
    await expect(resolveClinicSeatLimit(port, 'org-a')).resolves.toBe(0);
  });

  it('does not leak an override from organization A into organization B', async () => {
    const ports = new Map<string, OrgEntitlementsPort>([
      ['org-a', portFor(null, [{ mechanic: 'clinic_team', enabled: true, seatLimitOverride: 5 }])],
      ['org-b', portFor(null, [])],
    ]);
    const scopedPort: OrgEntitlementsPort = {
      getSnapshot: (organizationId) => ports.get(organizationId)!.getSnapshot(organizationId),
      getTariffForOrg: (organizationId) =>
        ports.get(organizationId)!.getTariffForOrg(organizationId),
      listOverrides: (organizationId) => ports.get(organizationId)!.listOverrides(organizationId),
      getEffectiveCommercialAccess: (organizationId) =>
        ports.get(organizationId)!.getEffectiveCommercialAccess(organizationId),
      getEnforcedQuotaUsage: (organizationId) =>
        ports.get(organizationId)!.getEnforcedQuotaUsage(organizationId),
    };
    await expect(resolveClinicSeatLimit(scopedPort, 'org-a')).resolves.toBe(5);
    await expect(resolveClinicSeatLimit(scopedPort, 'org-b')).resolves.toBe(0);
  });
});

describe('platform tariff constructor validation', () => {
  // Owner 2026-07-26 (#1003): "убрать необходимость ввода причины для правки тарифов" — a blank
  // reason must no longer block a write. `appendAudit` (pgPlatformEntitlements.ts) always writes
  // actorId/action/before/after regardless of reason content, so audit continuity does not depend
  // on this string being non-empty.
  it('accepts a blank audit reason and still forwards it to the port for the audit row', async () => {
    const port = { createTariff: vi.fn(async () => ({ id: 'created' })) };
    const service = createPlatformEntitlementsService(port as never);
    await service.createTariff(
      {
        name: 'Base',
        description: '',
        priceMinor: 1000,
        currency: 'rub',
        billingPeriod: 'month',
        mechanics: {},
        quotas: {},
        includedSeats: 1,
        isActive: true,
      },
      { actorId: 'actor-1', reason: '' },
    );
    expect(port.createTariff).toHaveBeenCalledWith(expect.objectContaining({ name: 'Base' }), {
      actorId: 'actor-1',
      reason: '',
    });
  });

  it('rejects a quota unit not registered for the mechanic', async () => {
    const port = { createTariff: vi.fn() };
    const service = createPlatformEntitlementsService(port as never);
    expect(() =>
      service.createTariff(
        {
          name: 'Base',
          description: '',
          priceMinor: null,
          currency: null,
          billingPeriod: 'month',
          mechanics: { booking: true },
          quotas: {
            booking: {
              kind: 'numeric',
              limit: 10,
              unit: 'bytes',
              period: 'month',
              usagePolicy: 'consumption',
            },
          },
          includedSeats: null,
          isActive: true,
        },
        { actorId: null, reason: 'test' },
      ),
    ).toThrow('tariff_quota_unit_invalid');
  });

  it('accepts arbitrary declared quota shapes but restricts enforced snapshot quotas to their atomic shape', () => {
    const port = { createTariff: vi.fn() };
    const service = createPlatformEntitlementsService(port as never);
    const base = {
      name: 'Base',
      description: '',
      priceMinor: null,
      currency: null,
      billingPeriod: 'month' as const,
      mechanics: { booking: true, courses: true, cms_pages: true },
      includedSeats: null,
      isActive: true,
    };
    service.createTariff(
      {
        ...base,
        quotas: {
          booking: {
            kind: 'numeric',
            limit: 10,
            unit: 'appointments',
            period: 'month',
            usagePolicy: 'consumption',
          },
        },
      },
      { actorId: null, reason: 'test' },
    );
    expect(port.createTariff).toHaveBeenCalledOnce();
    expect(() =>
      service.createTariff(
        {
          ...base,
          quotas: {
            courses: {
              kind: 'unlimited',
              limit: null,
              unit: 'items',
              period: 'month',
              usagePolicy: 'consumption',
            },
          },
        },
        { actorId: null, reason: 'test' },
      ),
    ).toThrow('tariff_quota_enforcement_shape_invalid');
    expect(() =>
      service.createTariff(
        {
          ...base,
          quotas: {
            cms_pages: {
              kind: 'numeric',
              limit: 10,
              unit: 'items',
              period: 'month',
              usagePolicy: 'consumption',
            },
          },
        },
        { actorId: null, reason: 'test' },
      ),
    ).toThrow('tariff_quota_enforcement_shape_invalid');
  });

  it('declares courses and CMS pages as DB-trigger enforcement and seats as application-transaction enforcement', () => {
    expect(MECHANIC_REGISTRY.courses.quotaEnforcement).toBe('atomic_snapshot');
    expect(MECHANIC_REGISTRY.cms_pages.quotaEnforcement).toBe('atomic_snapshot');
    // #1069: seats were incorrectly declared unenforced. The distinct tag tells debugging to
    // inspect pgOrganizationInvites' advisory-lock transaction, rather than the courses trigger.
    expect(MECHANIC_REGISTRY.clinic_team.quotaEnforcement).toBe('application_transaction_snapshot');
    expect(MECHANIC_REGISTRY.booking.quotaEnforcement).toBe('declared_no_enforcement');
    const migration = readFileSync(
      resolve(process.cwd(), 'db/drizzle-migrations/0225_saas_tariff_quotas_trial.sql'),
      'utf8',
    );
    expect(migration).toContain('CREATE TRIGGER courses_snapshot_quota_guard');
    expect(migration).toContain('AFTER INSERT ON public.courses');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('SELECT count(*) INTO v_count');
    expect(migration).toContain('v_count * 5 >= v_limit * 4');
    expect(migration).toContain('saas_quota_reached:courses');
    expect(migration).not.toContain('saas_organization_quota_usage');
    const migrationDir = resolve(process.cwd(), 'db/drizzle-migrations');
    const cmsPagesMigrationName = readdirSync(migrationDir).find((name) =>
      name.endsWith('_cms_pages_snapshot_quota.sql'),
    );
    expect(cmsPagesMigrationName).toBeTruthy();
    const cmsPagesMigration = readFileSync(resolve(migrationDir, cmsPagesMigrationName!), 'utf8');
    expect(cmsPagesMigration).toContain('CREATE TRIGGER content_pages_snapshot_quota_guard');
    expect(cmsPagesMigration).toContain('BEFORE INSERT ON public.content_pages');
    expect(cmsPagesMigration).toContain('CREATE OR REPLACE FUNCTION app.cms_pages_snapshot_usage(');
    expect(cmsPagesMigration).toContain(
      'CREATE OR REPLACE FUNCTION app.enforce_cms_pages_snapshot_quota()',
    );
    expect(cmsPagesMigration).toContain(
      'DROP TRIGGER IF EXISTS content_pages_snapshot_quota_guard',
    );
    expect(cmsPagesMigration).toContain('saas_quota:cms_pages:');
    expect(cmsPagesMigration).toContain('FROM public.content_pages');
    expect(cmsPagesMigration).toContain('WHERE organization_id = p_organization_id');
    expect(cmsPagesMigration).toContain('app.cms_pages_snapshot_usage(NEW.organization_id)');
    expect(cmsPagesMigration).toContain('SET updated_at = updated_at');
    expect(cmsPagesMigration).toContain(
      'GRANT UPDATE (updated_at) ON TABLE public.be_organizations TO app_owner',
    );
    expect(cmsPagesMigration).not.toContain('cms_pages_quota_requires_read_committed');
    expect(cmsPagesMigration).toContain('existing_page.section = NEW.section');
    expect(cmsPagesMigration).toContain('existing_page.slug = NEW.slug');
    expect(cmsPagesMigration).toContain('IF v_count >= v_limit THEN');
    expect(cmsPagesMigration).toContain('saas_quota_reached:cms_pages');
    expect(cmsPagesMigration).toContain("'saas_quota:cms_pages:' || NEW.organization_id::text");
    expect(cmsPagesMigration).toContain('GRANT SELECT ON TABLE public.content_pages TO app_owner');
    expect(cmsPagesMigration).not.toContain('saas_organization_quota_usage');
    const platformRuntime = readFileSync(
      resolve(process.cwd(), '../../deploy/postgres/c5a-platform-operations-runtime.sql'),
      'utf8',
    );
    expect(platformRuntime).toContain(
      'GRANT EXECUTE ON FUNCTION app.cms_pages_snapshot_usage(uuid)\n      TO app_platform_settings',
    );
    expect(platformRuntime).toContain("'app.cms_pages_snapshot_usage(uuid)',\n    'EXECUTE'");
    expect(platformRuntime).toContain(
      'CREATE OR REPLACE FUNCTION app.read_org_enforced_quota_usage(',
    );
    expect(platformRuntime).toContain(
      'GRANT EXECUTE ON FUNCTION app.read_org_enforced_quota_usage(uuid)',
    );
    expect(platformRuntime).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE\n    public.courses,\n    public.organization_member_invites\n  FROM app_platform_settings',
    );
    expect(platformRuntime).not.toContain(
      'CREATE POLICY courses_platform_quota_usage_select',
    );
    expect(platformRuntime).toContain('c5a_platform_enforced_quota_usage_exact_wall');
  });
});

describe('quota unit labels', () => {
  // Owner 2026-07-26 (#1003): "квоты... машинные ключи и непонятные единицы" — every quota unit
  // the registry declares must resolve to a human Russian label, not the raw machine key, and a
  // new mechanic can't silently ship without one (Record<TariffQuotaUnit, string> already makes a
  // missing key a type error; this test proves it stays a *human* label, not `unit === unit`).
  it('gives every declared quota unit a Russian label distinct from its raw key', () => {
    const declaredUnits = new Set(
      MECHANICS.flatMap((mechanic) => MECHANIC_REGISTRY[mechanic].quotaUnits),
    );
    expect(declaredUnits.size).toBeGreaterThan(0);
    for (const unit of declaredUnits) {
      const label = QUOTA_UNIT_LABELS[unit];
      expect(label).toBeTruthy();
      expect(label).not.toBe(unit);
      expect(/[а-яА-ЯёЁ]/.test(label)).toBe(true);
    }
  });
});
