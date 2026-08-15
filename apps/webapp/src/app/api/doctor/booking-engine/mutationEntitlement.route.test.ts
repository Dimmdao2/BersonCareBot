import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireDoctorBookingEngine: vi.fn(),
  requireEntitlementForMutation: vi.fn(),
  resolveDoctorOwnSpecialistId: vi.fn(),
  withDoctorWorkspacePrincipal: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForMutation: fakes.requireEntitlementForMutation,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: fakes.withDoctorWorkspacePrincipal,
}));
vi.mock('./_requireDoctorBookingEngine', () => ({
  requireDoctorBookingEngine: fakes.requireDoctorBookingEngine,
}));
vi.mock('./_resolveDoctorSpecialistId', () => ({
  resolveDoctorOwnSpecialistId: fakes.resolveDoctorOwnSpecialistId,
}));
vi.mock('@/app-layer/logging/logger', () => ({ logger: { error: vi.fn() } }));

import {
  DELETE as deleteWorkingHours,
  PATCH as patchWorkingHours,
  POST as saveWorkingHours,
} from './working-hours/route';
import { PUT as saveWorkingDays } from './working-days/route';
import {
  DELETE as deleteScheduleTemplate,
  POST as saveScheduleTemplate,
} from './working-schedule-templates/route';

const organizationId = '00000000-0000-4000-8000-000000001140';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requireDoctorBookingEngine.mockResolvedValue({
    ok: true,
    ctx: { organizationId, service: { catalog: {} } },
  });
  fakes.requireEntitlementForMutation.mockResolvedValue({
    ok: false,
    response: new Response(JSON.stringify({ ok: false }), { status: 403 }),
  });
});

describe('doctor scheduling mutation entitlement boundary', () => {
  it('blocks every schedule write before parsing or reaching a repository', async () => {
    const requests = [
      saveWorkingHours(new Request('http://localhost/working-hours', { method: 'POST' })),
      patchWorkingHours(new Request('http://localhost/working-hours', { method: 'PATCH' })),
      deleteWorkingHours(new Request('http://localhost/working-hours', { method: 'DELETE' })),
      saveWorkingDays(new Request('http://localhost/working-days', { method: 'PUT' })),
      saveScheduleTemplate(new Request('http://localhost/templates', { method: 'POST' })),
      deleteScheduleTemplate(new Request('http://localhost/templates', { method: 'DELETE' })),
    ];

    const responses = await Promise.all(requests);

    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403, 403, 403]);
    expect(fakes.requireEntitlementForMutation).toHaveBeenCalledTimes(6);
    expect(fakes.requireEntitlementForMutation).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      'booking',
    );
    expect(fakes.buildAppDeps).not.toHaveBeenCalled();
    expect(fakes.resolveDoctorOwnSpecialistId).not.toHaveBeenCalled();
    expect(fakes.withDoctorWorkspacePrincipal).not.toHaveBeenCalled();
  });
});
