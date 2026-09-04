import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Owner acceptance 2026-09-04, `APPT-FORM-05`: у нового пациента обязательно только `Имя *`;
 * фамилия, отчество, телефон и email необязательны. Форма записи заводит пациента двумя
 * doctor-путями — карточкой (`POST /api/doctor/clients`) и вместе с записью
 * (`manual-patient-visit`), — и оба обязаны принять пациента без фамилии.
 *
 * Поломка, которую ловит файл: путь отвечает `invalid_body`/`invalid_fio` на пациента,
 * у которого заполнено только имя, — врач физически не может завести такого пациента.
 * Обратная сторона: имя остаётся обязательным, фамилия его не подменяет.
 */
const fakes = vi.hoisted(() => ({
  requireDoctorWorkspaceApiContext: vi.fn(),
  requireDoctorBookingEngine: vi.fn(),
  resolveDoctorCreateSpecialist: vi.fn(),
  createManualOrganizationClient: vi.fn(),
  createManualPatientVisit: vi.fn(),
  resolveCabinetAccess: vi.fn(),
  resolveMechanicAccess: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: fakes.requireDoctorWorkspaceApiContext,
}));
vi.mock('@/app/api/doctor/booking-engine/_requireDoctorBookingEngine', () => ({
  requireDoctorBookingEngine: fakes.requireDoctorBookingEngine,
}));
vi.mock('@/app/api/doctor/booking-engine/_resolveDoctorAppointmentAccess', () => ({
  resolveDoctorCreateSpecialist: fakes.resolveDoctorCreateSpecialist,
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: (_ctx: unknown, _source: string, work: () => Promise<unknown>) =>
    work(),
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: (_ctx: unknown, _source: string, work: () => Promise<unknown>) =>
    work(),
}));
vi.mock('@/modules/integrator/bookingM2mApi', () => ({
  createBookingSyncPort: () => ({ emitBookingEvent: vi.fn(async () => undefined) }),
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    patientOrganization: createPatientOrganizationService({
      port: {
        createManualOrganizationClient: fakes.createManualOrganizationClient,
      } as unknown as PatientOrganizationPort,
    }),
    emailSetupAccess: { requestContactEmailSetup: vi.fn() },
    orgEntitlements: {
      resolveCabinetAccess: fakes.resolveCabinetAccess,
      resolveMechanicAccess: fakes.resolveMechanicAccess,
    },
    bookingScheduling: null,
    patientBooking: { getBookingByCanonicalAppointment: async () => null },
  }),
}));

import { createPatientOrganizationService } from '@/modules/patient-organization/service';
import type { PatientOrganizationPort } from '@/modules/patient-organization/ports';
import { POST as createClient } from './clients/route';
import { POST as createPatientVisit } from './booking-engine/appointments/manual-patient-visit/route';

const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const SPECIALIST_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const SERVICE_ID = '44444444-4444-4444-8444-444444444444';
const REQUEST_ID = '55555555-5555-4555-8555-555555555555';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requireDoctorWorkspaceApiContext.mockResolvedValue({
    ok: true,
    ctx: {
      organizationId: ORGANIZATION_ID,
      specialistId: SPECIALIST_ID,
      session: { user: { userId: 'user-1' } },
    },
  });
  fakes.resolveCabinetAccess.mockResolvedValue({
    state: 'full_access',
    policySource: 'global_paid_period',
    warning: null,
  });
  fakes.resolveMechanicAccess.mockResolvedValue({
    state: 'enabled',
    policySource: 'global_paid_period',
    warning: null,
    mutationAllowed: true,
  });
  fakes.createManualOrganizationClient.mockImplementation(async () => ({
    ok: true as const,
    userId: 'patient-1',
    displayName: 'Мария',
    lastName: null,
    firstName: 'Мария',
    patronymic: null,
    phoneNormalized: '+79990000000',
    created: true,
  }));

  fakes.requireDoctorBookingEngine.mockResolvedValue({
    ok: true,
    ctx: {
      organizationId: ORGANIZATION_ID,
      session: { user: { userId: 'user-1' } },
      service: {
        getAppointment: async () => null,
        getSpecialistAppointmentReminderSettings: async () => ({
          allowedPresetIds: [],
          defaultPresetId: null,
        }),
        createManualPatientVisit: fakes.createManualPatientVisit,
      },
    },
  });
  fakes.resolveDoctorCreateSpecialist.mockResolvedValue({ ok: true, specialistId: SPECIALIST_ID });
  fakes.createManualPatientVisit.mockImplementation(async () => ({
    kind: 'scheduled' as const,
    replayed: false,
    portalStatus: 'not_activated' as const,
    appointment: {
      id: 'appointment-1',
      organizationId: ORGANIZATION_ID,
      startAt: '2027-03-10T09:00:00.000Z',
      endAt: '2027-03-10T09:30:00.000Z',
      appointmentReminderPresetId: null,
      attributionJson: {},
    },
    clinicalVisitId: 'visit-1',
    patient: {
      userId: 'patient-1',
      displayName: 'Мария',
      lastName: null,
      firstName: 'Мария',
      patronymic: null,
      phoneNormalized: '+79990000000',
      created: true,
    },
  }));
});

function clientRequest(body: Record<string, unknown>) {
  return new Request('http://test/api/doctor/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function visitRequest(body: Record<string, unknown>) {
  return new Request(
    'http://test/api/doctor/booking-engine/appointments/manual-patient-visit',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requestId: REQUEST_ID,
        kind: 'scheduled',
        branchId: BRANCH_ID,
        serviceId: SERVICE_ID,
        specialistId: SPECIALIST_ID,
        startAt: '2027-03-10T09:00:00.000Z',
        endAt: '2027-03-10T09:30:00.000Z',
        durationMinutes: 30,
        ...body,
      }),
    },
  );
}

describe('doctor patient identity — фамилия необязательна (APPT-FORM-05)', () => {
  it('заводит карточку пациента, у которого заполнено только имя', async () => {
    const response = await createClient(
      clientRequest({ firstName: 'Мария', phone: '+79990000000' }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, client: { id: 'patient-1' } });
    expect(fakes.createManualOrganizationClient).toHaveBeenCalledWith(
      expect.objectContaining({ lastName: null, firstName: 'Мария' }),
    );
  });

  it('заводит запись с новым пациентом, у которого заполнено только имя', async () => {
    const response = await createPatientVisit(visitRequest({ firstName: 'Мария' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(fakes.createManualPatientVisit).toHaveBeenCalledWith(
      expect.objectContaining({ lastName: null, firstName: 'Мария' }),
    );
  });

  it('имя остаётся обязательным: фамилия его не подменяет ни на одном из двух путей', async () => {
    const clientResponse = await createClient(
      clientRequest({ lastName: 'Иванова', phone: '+79990000000' }),
    );
    expect(clientResponse.status).toBe(400);
    expect(fakes.createManualOrganizationClient).not.toHaveBeenCalled();

    const visitResponse = await createPatientVisit(visitRequest({ lastName: 'Иванова' }));
    expect(visitResponse.status).toBe(400);
    expect(fakes.createManualPatientVisit).not.toHaveBeenCalled();
  });
});
