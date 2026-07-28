import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockRequirePatientApiBusinessAccess = vi.hoisted(() => vi.fn());
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePatientApiBusinessAccess: mockRequirePatientApiBusinessAccess,
}));

const mockGetCheckinState = vi.hoisted(() => vi.fn());
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    patientMood: { getCheckinState: mockGetCheckinState },
  }),
}));

const mockGetAppDisplayTimeZone = vi.hoisted(() => vi.fn().mockResolvedValue('Europe/Moscow'));
vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: mockGetAppDisplayTimeZone,
}));

import { GET } from './route';

const SESSION = {
  user: {
    userId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    role: 'client' as const,
    phone: '+79990001122',
  },
};

describe('GET /api/patient/mood/today', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePatientApiBusinessAccess.mockResolvedValue({ ok: true, session: SESSION });
    mockGetCheckinState.mockResolvedValue({
      mood: { moodDate: '2026-04-28', score: 5 },
      lastEntry: { id: 'e1', recordedAt: '2026-04-28T08:00:00.000Z', score: 5 },
    });
  });

  it('returns 401 when not authenticated', async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns today's mood", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      ok: true,
      mood: { moodDate: '2026-04-28', score: 5 },
      lastEntry: { id: 'e1', recordedAt: '2026-04-28T08:00:00.000Z', score: 5 },
    });
    expect(mockGetAppDisplayTimeZone).toHaveBeenCalled();
    expect(mockGetCheckinState).toHaveBeenCalledWith(SESSION.user.userId, 'Europe/Moscow');
  });

  it('returns null mood when nothing is saved today', async () => {
    mockGetCheckinState.mockResolvedValue({ mood: null, lastEntry: null });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, mood: null, lastEntry: null });
  });
});
