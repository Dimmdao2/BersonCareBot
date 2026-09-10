/**
 * Переход по ссылке приглашения человеком, который УЖЕ вошёл.
 *
 * Владелец 10.09.2026, дословно: «если он уже залогинен, то у него открывается его кабинет сразу в
 * эту клинику. Если он не залогинен… введите свой имейл и получите код».
 *
 * ЧТО ЛОМАЕТСЯ БЕЗ ЭТОГО ФАЙЛА — две поломки, и вторая тихая и опасная:
 * 1. Вошедшего человека всё равно ведут на экран «введите имейл» — просят доказать доказанное. На
 *    телефоне это лишний код из письма ради кабинета, в который он уже вошёл.
 * 2. Обратная крайность, если срезать проверку: приглашение принимается ЛЮБОЙ живой сессией. Тогда
 *    достаточно открыть чужую ссылку в своём браузере, чтобы кабинет чужого пациента прицепился к
 *    твоей учётной записи. Приглашение выписано на конкретную запись человека — вход под другим
 *    идентификатором доказательством ЭТОГО приглашения не является, и путь обязан остаться
 *    почтовым.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  getCurrentSessionForIdentitySelf: vi.fn(),
  enterStaffSecuritySelfPrincipal: vi.fn(),
  checkPatientInvitePublicRateLimit: vi.fn(),
  cookieSet: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({ ensureAuthModulePortsBound: () => {} }));
vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: () => undefined,
}));
vi.mock('@/app-layer/principal/staffSecuritySelfPrincipal', () => ({
  enterStaffSecuritySelfPrincipal: fakes.enterStaffSecuritySelfPrincipal,
}));
vi.mock('@/modules/auth/service', () => ({
  getCurrentSessionForIdentitySelf: fakes.getCurrentSessionForIdentitySelf,
}));
vi.mock('@/modules/patient-invites/rateLimit', () => ({
  checkPatientInvitePublicRateLimit: fakes.checkPatientInvitePublicRateLimit,
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ set: fakes.cookieSet, get: () => undefined }),
}));

import { createPatientInvitesService } from '@/modules/patient-invites/service';
import {
  createInMemoryPatientInvitesPort,
  resetInMemoryPatientInvitesForTests,
  setInMemoryPatientInviteEnrollmentForTests,
} from '@/infra/repos/inMemoryPatientInvites';
import { POST as exchange } from './exchange/route';

const ORGANIZATION_ID = '00000000-0000-4000-8000-0000000000a1';
const PATIENT_ID = '00000000-0000-4000-8000-0000000000b1';
const SOMEONE_ELSE_ID = '00000000-0000-4000-8000-0000000000b2';
const DOCTOR_ID = '00000000-0000-4000-8000-0000000000c1';

const port = createInMemoryPatientInvitesPort();
const patientInvites = createPatientInvitesService({ port });

async function liveInviteBearer(): Promise<string> {
  setInMemoryPatientInviteEnrollmentForTests({
    organizationId: ORGANIZATION_ID,
    patientUserId: PATIENT_ID,
    status: 'invited',
  });
  const issued = await patientInvites.issue({
    organizationId: ORGANIZATION_ID,
    patientUserId: PATIENT_ID,
    invitedEmail: 'patient@example.test',
    createdByPlatformUserId: DOCTOR_ID,
  });
  if (!issued.ok) throw new Error('test_seed_invite_failed');
  // Носитель живёт только во фрагменте ссылки — берём его оттуда же, откуда возьмёт браузер.
  return issued.relativeUrl.split('#')[1] ?? '';
}

function exchangeRequest(bearer: string): Request {
  return new Request('https://patient.example.test/api/join/exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bearer }),
  });
}

async function exchangeAs(
  session: { userId: string; role: 'client' | 'doctor' } | null,
): Promise<{ status: number; body: { ok?: unknown; redirectTo?: unknown } }> {
  fakes.getCurrentSessionForIdentitySelf.mockResolvedValue(
    session ? { user: { userId: session.userId, role: session.role } } : null,
  );
  const response = await exchange(exchangeRequest(await liveInviteBearer()));
  return { status: response.status, body: await response.json() };
}

describe('переход по ссылке приглашения с живой сессией', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetInMemoryPatientInvitesForTests();
    fakes.buildAppDeps.mockReturnValue({ patientInvites });
    fakes.checkPatientInvitePublicRateLimit.mockResolvedValue('ok');
  });

  it('вошедший пациент попадает прямо в кабинет этой клиники, а не на экран с имейлом', async () => {
    const result = await exchangeAs({ userId: PATIENT_ID, role: 'client' });

    expect(result.status).toBe(200);
    expect(result.body.redirectTo).toBe('/app/patient');
    // Клиника запомнена: кабинет открывается именно в неё, а не в последнюю просмотренную.
    expect(fakes.cookieSet).toHaveBeenCalledWith(
      'bc_patient_organization',
      ORGANIZATION_ID,
      expect.objectContaining({ httpOnly: true }),
    );
    // И приглашение действительно принято — второй заход уже не сработает.
    const status = await patientInvites.getPortalStatus(ORGANIZATION_ID, PATIENT_ID);
    expect(status.status).toBe('linked');
  });

  it('чужая сессия НЕ принимает приглашение — человека ведут доказывать личность почтой', async () => {
    const result = await exchangeAs({ userId: SOMEONE_ELSE_ID, role: 'client' });

    expect(result.status).toBe(200);
    expect(String(result.body.redirectTo)).toMatch(/^\/join\//);
    // Главное: кабинет НЕ прицепился ни к кому — приглашение осталось непринятым.
    const status = await patientInvites.getPortalStatus(ORGANIZATION_ID, PATIENT_ID);
    expect(status.status).toBe('invited');
  });

  it('сессия специалиста приглашение не принимает', async () => {
    const result = await exchangeAs({ userId: DOCTOR_ID, role: 'doctor' });

    expect(String(result.body.redirectTo)).toMatch(/^\/join\//);
    const status = await patientInvites.getPortalStatus(ORGANIZATION_ID, PATIENT_ID);
    expect(status.status).toBe('invited');
  });

  it('без сессии — прежний путь: экран приглашения с имейлом и кодом', async () => {
    const result = await exchangeAs(null);

    expect(result.status).toBe(200);
    expect(String(result.body.redirectTo)).toMatch(/^\/join\//);
    const status = await patientInvites.getPortalStatus(ORGANIZATION_ID, PATIENT_ID);
    expect(status.status).toBe('invited');
  });
});
