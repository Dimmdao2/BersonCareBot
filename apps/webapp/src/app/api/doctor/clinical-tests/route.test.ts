import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn((_: unknown, _source: string, fn: () => unknown) => fn()),
);

vi.mock('@/modules/auth/service', () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: (ctx: unknown, source: string, fn: () => unknown) =>
    withDoctorWorkspacePrincipalMock(ctx, source, fn),
}));

vi.mock('@/app-layer/di/buildAppDeps', async () => {
  const { createClinicalTestsService } = await import('@/modules/tests/service');
  const { inMemoryClinicalTestsPort } = await import('@/app-layer/testing/clinicalLibraryInMemory');
  const { inMemoryReferencesPort } = await import('@/infra/repos/inMemoryReferences');
  const clinicalTests = createClinicalTestsService(
    inMemoryClinicalTestsPort,
    inMemoryReferencesPort,
  );
  return {
    buildAppDeps: () => ({ clinicalTests }),
  };
});

import { resetInMemoryClinicalTestsStore } from '@/app-layer/testing/clinicalLibraryInMemory';
import { POST } from './route';

describe('POST /api/doctor/clinical-tests', () => {
  beforeEach(() => {
    resetInMemoryClinicalTestsStore();
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        session: { user: { userId: 'd1', role: 'doctor', bindings: {} } },
        organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
    });
  });

  it('returns 401 without session', async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401 }),
    });
    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'T' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 for client role', async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 403 }),
    });
    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'T' }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns the clinical guard's 403 for a management-only organization admin", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 403 }),
    });

    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'No clinical access' }),
      }),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'forbidden' });
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });

  it('creates test with assessmentKind from catalog', async () => {
    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Api T', assessmentKind: 'mobility' }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; item: { assessmentKind: string | null } };
    expect(data.ok).toBe(true);
    expect(data.item.assessmentKind).toBe('mobility');
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
      'doctor.clinical-tests.create',
      expect.any(Function),
    );
  });

  it('returns 400 when assessmentKind not in catalog', async () => {
    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Bad', assessmentKind: 'not_in_catalog' }),
      }),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { ok: boolean; error: string };
    expect(data.ok).toBe(false);
    expect(data.error).toMatch(/вид оценки/);
  });
});
