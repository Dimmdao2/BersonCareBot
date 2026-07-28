/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetInMemoryClinicalTestMeasureKindsStore,
  inMemoryClinicalTestMeasureKindsPort,
} from '@/infra/repos/inMemoryClinicalTestMeasureKinds';
import { createClinicalTestMeasureKindsService } from '@/modules/tests/measureKindsService';

// A-6 / #1007 (docs/_TODO/NIGHT_PLAN_2026-07-26.md): `clinical_test_measure_kinds` has no
// `organization_id` column at all (owner FINAL scope decision 2026-06-17,
// docs/_TODO/SAAS_FOUNDATION/scope-derivation/VERIFIED_SCOPE.md — it is deliberately NOT in the
// 84-table needs-org-id list, i.e. it is a platform-owned catalog, not per-tenant). The real
// service (`measureKindsService` over `pgClinicalTestMeasureKinds`) never filtered by org, so any
// authenticated doctor from ANY clinic could relabel/reorder every row in the ONE shared table via
// PATCH. This test wires the route to the real service/in-memory-port pair (only the DB-principal /
// session boundary is mocked, matching the repo's route-test convention) so it exercises the actual
// business logic, not a stand-in.
//
// `requireDoctorWorkspaceApiContext` is mocked per-call to return a DIFFERENT organizationId,
// simulating two unrelated clinics — the in-memory port mirrors the real Postgres port's total
// absence of org scoping for this table.

const { requireDoctorWorkspaceApiContextMock, requirePlatformOperationsApiContextMock } =
  vi.hoisted(() => ({
    requireDoctorWorkspaceApiContextMock: vi.fn(),
    requirePlatformOperationsApiContextMock: vi.fn(),
  }));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
  requirePlatformOperationsApiContext: requirePlatformOperationsApiContextMock,
}));

vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: (
    _ctx: unknown,
    sourceOrFn: string | (() => unknown),
    maybeFn?: () => unknown,
  ) => {
    const fn = typeof sourceOrFn === 'function' ? sourceOrFn : maybeFn;
    if (!fn) throw new Error('principal_callback_required');
    return fn();
  },
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    measureKinds: createClinicalTestMeasureKindsService(inMemoryClinicalTestMeasureKindsPort),
  }),
}));

function doctorCtx(organizationId: string, userId: string) {
  return {
    ok: true as const,
    ctx: {
      organizationId,
      session: { user: { userId, role: 'doctor' as const, displayName: userId, bindings: {} } },
    },
  };
}

function platformOk() {
  return {
    ok: true as const,
    session: {
      user: { userId: 'platform-1', role: 'admin' as const, displayName: 'Platform', bindings: {} },
    },
  };
}

function forbidden() {
  return {
    ok: false as const,
    response: new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 403 }),
  };
}

describe('/api/doctor/measure-kinds — A-6 cross-tenant write', () => {
  beforeEach(() => {
    resetInMemoryClinicalTestMeasureKindsStore();
    requireDoctorWorkspaceApiContextMock.mockReset();
    requirePlatformOperationsApiContextMock.mockReset();
  });

  it('doctor can still read the catalog (own-work preserved)', async () => {
    const { GET } = await import('./route');
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce(doctorCtx('org-1', 'doc-a'));
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it('doctor from org A can still create a new label (idempotent-by-code insert, own-work preserved)', async () => {
    const { POST } = await import('./route');
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce(doctorCtx('org-1', 'doc-a'));
    const res = await POST(
      new Request('http://localhost/api/doctor/measure-kinds', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: 'Сила кисти' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; item: { label: string } };
    expect(body.ok).toBe(true);
    expect(body.item.label).toBe('Сила кисти');
  });

  it('PATCH now requires the platform operator — a doctor session (any org) is refused, 403, no mutation', async () => {
    const svc = createClinicalTestMeasureKindsService(inMemoryClinicalTestMeasureKindsPort);
    const created = await svc.createMeasureKindFromLabel('Амплитуда сгибания');
    const { PATCH } = await import('./route');

    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce(doctorCtx('org-2', 'doc-b'));
    requirePlatformOperationsApiContextMock.mockResolvedValueOnce(forbidden());

    const res = await PATCH(
      new Request('http://localhost/api/doctor/measure-kinds', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: [{ id: created.row.id, label: 'ВЗЛОМАНО другой клиникой', sortOrder: 0 }],
        }),
      }),
    );

    expect(res.status).toBe(403);
    const after = await svc.listMeasureKinds();
    expect(after[0]?.label).toBe('Амплитуда сгибания');
    expect(after[0]?.label).not.toBe('ВЗЛОМАНО другой клиникой');
  });

  it('PATCH succeeds for the platform operator — legitimate catalog management still works', async () => {
    const svc = createClinicalTestMeasureKindsService(inMemoryClinicalTestMeasureKindsPort);
    const created = await svc.createMeasureKindFromLabel('Амплитуда сгибания');
    const { PATCH } = await import('./route');

    requirePlatformOperationsApiContextMock.mockResolvedValueOnce(platformOk());

    const res = await PATCH(
      new Request('http://localhost/api/doctor/measure-kinds', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: [{ id: created.row.id, label: 'Амплитуда сгибания (уточнено)', sortOrder: 0 }],
        }),
      }),
    );

    expect(res.status).toBe(200);
    const after = await svc.listMeasureKinds();
    expect(after[0]?.label).toBe('Амплитуда сгибания (уточнено)');
  });
});
