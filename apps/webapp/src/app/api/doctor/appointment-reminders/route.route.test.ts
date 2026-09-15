import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireDoctorWorkspaceApiContext: vi.fn(),
  updateSetting: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: fakes.requireDoctorWorkspaceApiContext,
}));

import { PATCH } from './route';

const organizationId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';

function patch(offsetsMinutes: number[]) {
  return PATCH(
    new Request('http://localhost/api/doctor/appointment-reminders', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ offsetsMinutes }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requireDoctorWorkspaceApiContext.mockResolvedValue({
    ok: true,
    ctx: { organizationId, session: { user: { userId } } },
  });
  fakes.updateSetting.mockImplementation(async (_key, _scope, value) => ({
    valueJson: { value },
  }));
  fakes.buildAppDeps.mockReturnValue({
    systemSettings: { updateSetting: fakes.updateSetting },
  });
});

describe('doctor appointment reminder settings', () => {
  it.each([[1440, 120, 30], []])(
    'persists a valid schedule in the guarded organization',
    async (...offsetsMinutes) => {
      const response = await patch(offsetsMinutes);

      expect(response.status).toBe(200);
      expect(fakes.updateSetting).toHaveBeenCalledWith(
        'doctor_appointment_reminder_offsets_minutes',
        'doctor',
        offsetsMinutes,
        userId,
        { organizationId },
      );
    },
  );

  it('rejects a fourth reminder before persistence', async () => {
    const response = await patch([1440, 120, 60, 30]);

    expect(response.status).toBe(400);
    expect(fakes.updateSetting).not.toHaveBeenCalled();
  });
});
