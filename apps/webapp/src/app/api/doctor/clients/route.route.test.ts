import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Т12 (владелец 19.08, дословно): «лимит клиентов - убрать».
 *
 * Что здесь доказывается ПОВЕДЕНИЕМ, а не отсутствием строки в коде: врач заводит клиента, и по
 * дороге НИКТО не спрашивает тариф. Реестр механик поднимается настоящий, резолвер механик —
 * настоящая функция `resolveMechanicAccess`, которой подсунут порт, отвечающий «выключено» на
 * ЛЮБУЮ механику. Если бы у создания клиента остался хоть какой-то тарифный гейт, он бы прочитал
 * этот порт и вернул 403; тест ловит и это (`expect(...).not.toHaveBeenCalled()`), и результат.
 *
 * Ниже по стеку тоже настоящее: `createDoctorClient` и `createPatientOrganizationService`. Весь
 * запрос выполняется внутри `runWithoutMechanicWriteClearance` — то есть в контексте, где ни одно
 * mutation-решение не отмечено. Прежняя физическая дверь 3.2 на этом бросала
 * `MechanicWriteClearanceRequiredError`; теперь двери нет.
 */
const fakes = vi.hoisted(() => ({
  requireDoctorWorkspaceApiContext: vi.fn(),
  resolveMechanicAccess: vi.fn(),
  createManualOrganizationClient: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: fakes.requireDoctorWorkspaceApiContext,
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: (_ctx: unknown, _source: string, work: () => Promise<unknown>) =>
    work(),
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    patientOrganization: createPatientOrganizationService({
      port: {
        listActiveEnrollmentsByPlatformUser: async () => [],
        hasActiveEnrollment: async () => false,
        hasSchedulableClientRelationship: async () => false,
        createManualOrganizationClient: fakes.createManualOrganizationClient,
        findTreatmentProgramOrganizationForPatient: async () => null,
        findTreatmentProgramDescriptionForPatient: async () => null,
      } as unknown as PatientOrganizationPort,
    }),
    emailSetupAccess: { requestContactEmailSetup: vi.fn() },
    orgEntitlements: { resolveMechanicAccess: fakes.resolveMechanicAccess },
  }),
}));

import { runWithoutMechanicWriteClearance } from '@/app-layer/entitlements/mechanicWriteClearance';
import { createPatientOrganizationService } from '@/modules/patient-organization/service';
import type { PatientOrganizationPort } from '@/modules/patient-organization/ports';
import { POST } from './route';

const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';

function request(lastName: string) {
  return new Request('http://test/api/doctor/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lastName, firstName: 'Иван', phone: '+79990000000' }),
  });
}

describe('doctor client create — Т12, у клиники нет лимита клиентов', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireDoctorWorkspaceApiContext.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: ORGANIZATION_ID,
        specialistId: 'spec-1',
        session: { user: { userId: 'user-1' } },
      },
    });
    // «Любой тариф» в самой недружелюбной форме: на что ни спроси — доступа нет.
    fakes.resolveMechanicAccess.mockResolvedValue({
      state: 'disabled',
      policySource: 'unconfigured',
      warning: null,
      mutationAllowed: false,
    });
    fakes.createManualOrganizationClient.mockImplementation(async () => ({
      ok: true as const,
      userId: 'patient-1',
      displayName: 'Иванов Иван',
      lastName: 'Иванов',
      firstName: 'Иван',
      patronymic: null,
      phoneNormalized: '+79990000000',
      created: true,
    }));
  });

  it('заводит клиента, не спросив тариф, и на сотом клиенте так же, как на первом', async () => {
    // «При любом числе уже существующих пациентов»: сотня подряд, ни одна не встречает потолка.
    for (let index = 0; index < 100; index += 1) {
      const response = await runWithoutMechanicWriteClearance(() =>
        POST(request(`Иванов${index}`)),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        client: { id: 'patient-1' },
        created: true,
      });
    }

    expect(fakes.createManualOrganizationClient).toHaveBeenCalledTimes(100);
    expect(fakes.resolveMechanicAccess).not.toHaveBeenCalled();
  });

  it('отказ по существу дела остаётся отказом: 409 на занятый email', async () => {
    fakes.createManualOrganizationClient.mockResolvedValue({
      ok: false as const,
      error: 'email_conflict' as const,
    });

    const response = await runWithoutMechanicWriteClearance(() => POST(request('Иванов')));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'email_conflict' });
  });
});
