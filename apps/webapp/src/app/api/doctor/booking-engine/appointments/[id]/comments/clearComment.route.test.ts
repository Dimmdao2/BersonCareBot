import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Owner acceptance 2026-09-04, `APPT-FORM-13`: очистка основного комментария записи доезжает через
 * тот же контракт комментариев. Отдельного контракта/истории для очистки нет.
 *
 * Поломки, которые ловит файл:
 * - очистка не доходит до хранилища (комментарий возвращается после перезагрузки карточки);
 * - очистка проходит мимо `own`-границы записи, доступной только своему специалисту;
 * - очистка выполняется вне principal-обёртки рабочего места врача (RLS/GRANT считают роль чужой).
 */
const fakes = vi.hoisted(() => ({
  requireDoctorBookingEngine: vi.fn(),
  resolveDoctorAppointmentAccess: vi.fn(),
  clearAppointmentComments: vi.fn(),
  principalCalls: [] as string[],
}));

vi.mock('../../../_requireDoctorBookingEngine', () => ({
  requireDoctorBookingEngine: fakes.requireDoctorBookingEngine,
}));
vi.mock('../../../_resolveDoctorAppointmentAccess', () => ({
  resolveDoctorAppointmentAccess: fakes.resolveDoctorAppointmentAccess,
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: async (_ctx: unknown, work: () => Promise<unknown>) => {
    fakes.principalCalls.push('enter');
    return work();
  },
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    clientHistory: { clearAppointmentComments: fakes.clearAppointmentComments },
  }),
}));

import { DELETE } from './route';

const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const APPOINTMENT_ID = '11111111-1111-4111-8111-111111111111';

function params(id: string = APPOINTMENT_ID) {
  return { params: Promise.resolve({ id }) };
}

describe('DELETE /api/doctor/booking-engine/appointments/:id/comments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.principalCalls.length = 0;
    fakes.requireDoctorBookingEngine.mockResolvedValue({
      ok: true,
      ctx: { organizationId: ORGANIZATION_ID, session: { user: { userId: 'staff-1' } } },
    });
    fakes.resolveDoctorAppointmentAccess.mockResolvedValue({
      id: APPOINTMENT_ID,
      platformUserId: 'patient-1',
    });
    fakes.clearAppointmentComments.mockResolvedValue(undefined);
  });

  it('clears the appointment comment through the client-history contract', async () => {
    const response = await DELETE(new Request('http://localhost'), params());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(fakes.clearAppointmentComments).toHaveBeenCalledWith(ORGANIZATION_ID, APPOINTMENT_ID);
    expect(fakes.principalCalls).toEqual(['enter']);
  });

  it('keeps the same own-appointment boundary as writing a comment', async () => {
    fakes.resolveDoctorAppointmentAccess.mockResolvedValue(null);

    const response = await DELETE(new Request('http://localhost'), params());

    expect(response.status).toBe(404);
    expect(fakes.resolveDoctorAppointmentAccess).toHaveBeenCalledWith(
      expect.anything(),
      APPOINTMENT_ID,
      'own',
    );
    expect(fakes.clearAppointmentComments).not.toHaveBeenCalled();
  });
});
