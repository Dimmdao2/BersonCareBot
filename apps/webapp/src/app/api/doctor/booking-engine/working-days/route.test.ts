import { describe, expect, it, vi, beforeEach } from 'vitest';

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const listWorkingDaysMock = vi.hoisted(() => vi.fn());
const upsertWorkingDaysMock = vi.hoisted(() => vi.fn());
const closeWorkingDaysMock = vi.hoisted(() => vi.fn());
const clearWorkingDaysMock = vi.hoisted(() => vi.fn());
const principalState = vi.hoisted(() => ({ inside: false }));
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(
    async <T>(_workspace: { organizationId: string }, _source: string, fn: () => Promise<T>) => {
      principalState.inside = true;
      try {
        return await fn();
      } finally {
        principalState.inside = false;
      }
    },
  ),
);

vi.mock('../_requireDoctorBookingEngine', () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    bookingScheduling: {
      listWorkingDays: listWorkingDaysMock,
      upsertWorkingDays: upsertWorkingDaysMock,
      closeWorkingDays: closeWorkingDaysMock,
      clearWorkingDays: clearWorkingDaysMock,
    },
  }),
}));

vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

import { GET, PUT } from './route';

const OWN_SPECIALIST = '518ea988-9b5e-4ad8-8194-a2d98f43bd7b';
const FOREIGN = '99999999-9999-4999-8999-999999999999';

function mockGate(specialists: { id: string; isActive: boolean }[]) {
  requireDoctorBookingEngineMock.mockResolvedValue({
    ok: true,
    ctx: {
      organizationId: 'org-1',
      service: { catalog: { listSpecialists: vi.fn().mockResolvedValue(specialists) } },
    },
  });
}

describe('/api/doctor/booking-engine/working-days (self-scope)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    principalState.inside = false;
  });

  it("GET forces the doctor's own specialist", async () => {
    mockGate([{ id: OWN_SPECIALIST, isActive: true }]);
    listWorkingDaysMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(false);
      return [];
    });

    const res = await GET(
      new Request(
        'http://localhost/api/doctor/booking-engine/working-days?dateFrom=2026-06-01&dateTo=2026-06-30',
      ),
    );
    expect(res.status).toBe(200);
    expect(listWorkingDaysMock).toHaveBeenCalledWith(
      expect.objectContaining({ specialistId: OWN_SPECIALIST, organizationId: 'org-1' }),
    );
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });

  it('PUT upsert forces own specialist regardless of body and runs under principal', async () => {
    mockGate([{ id: OWN_SPECIALIST, isActive: true }]);
    upsertWorkingDaysMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return [];
    });

    const res = await PUT(
      new Request('http://localhost/api/doctor/booking-engine/working-days', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert',
          dates: ['2026-06-22'],
          startMinute: 540,
          endMinute: 1080,
          specialistId: FOREIGN,
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(upsertWorkingDaysMock).toHaveBeenCalledWith(
      expect.objectContaining({ specialistId: OWN_SPECIALIST }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
      'doctor.booking-engine.working-days.upsert',
      expect.any(Function),
    );
  });

  it('PUT close forces own specialist and runs under principal', async () => {
    mockGate([{ id: OWN_SPECIALIST, isActive: true }]);
    closeWorkingDaysMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return [];
    });

    const res = await PUT(
      new Request('http://localhost/api/doctor/booking-engine/working-days', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close', dates: ['2026-06-22'], specialistId: FOREIGN }),
      }),
    );
    expect(res.status).toBe(200);
    expect(closeWorkingDaysMock).toHaveBeenCalledWith(
      expect.objectContaining({ specialistId: OWN_SPECIALIST, dates: ['2026-06-22'] }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
      'doctor.booking-engine.working-days.close',
      expect.any(Function),
    );
  });

  it('PUT clear forces own specialist and runs under principal', async () => {
    mockGate([{ id: OWN_SPECIALIST, isActive: true }]);
    clearWorkingDaysMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
    });

    const res = await PUT(
      new Request('http://localhost/api/doctor/booking-engine/working-days', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear', dates: ['2026-06-22'], specialistId: FOREIGN }),
      }),
    );
    expect(res.status).toBe(200);
    expect(clearWorkingDaysMock).toHaveBeenCalledWith(
      expect.objectContaining({ specialistId: OWN_SPECIALIST, dates: ['2026-06-22'] }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
      'doctor.booking-engine.working-days.clear',
      expect.any(Function),
    );
  });

  it('returns 409 when no specialist configured', async () => {
    mockGate([]);
    const res = await GET(
      new Request(
        'http://localhost/api/doctor/booking-engine/working-days?dateFrom=2026-06-01&dateTo=2026-06-30',
      ),
    );
    expect(res.status).toBe(409);
    expect(listWorkingDaysMock).not.toHaveBeenCalled();
  });
});
