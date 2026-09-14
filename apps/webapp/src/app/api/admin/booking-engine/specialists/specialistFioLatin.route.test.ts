/**
 * §20 канона идентичности (`docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md`): ФИО сотрудника клиники —
 * только кириллица, запрет стоит НА ВВОДЕ. Проверяется настоящая дверь, через которую клиника заводит
 * и правит карточку специалиста: латинское имя не должно доехать до записи, кириллическое — должно.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  requireGate: vi.fn(),
  requireEntitlement: vi.fn(),
  upsertSpecialist: vi.fn(),
  getSpecialist: vi.fn(),
  setSpecialistLocation: vi.fn(),
}));

vi.mock('../_requireClinicManagementBookingEngine', () => ({
  requireClinicManagementBookingEngine: fakes.requireGate,
}));
vi.mock('../../_requireClinicManagementBookingEngine', () => ({
  requireClinicManagementBookingEngine: fakes.requireGate,
}));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForMutation: fakes.requireEntitlement,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: <T>(_ctx: unknown, _op: string, run: () => T): T => run(),
}));

import { FIO_LATIN_REJECTED_TEXT } from '@/shared/lib/fio';
import { POST as createSpecialist } from './route';
import { PATCH as updateSpecialist } from './[id]/route';

const ORGANIZATION_ID = '00000000-0000-4000-8000-00000000c020';
const SPECIALIST_ID = '00000000-0000-4000-8000-00000000c120';

const existingSpecialist = {
  id: SPECIALIST_ID,
  organizationId: ORGANIZATION_ID,
  fullName: 'Иванов Иван Иванович',
  description: null,
  avatarMediaId: null,
  fullDescriptionMarkdown: null,
  cardIsPublished: false,
  isActive: true,
  sortOrder: 10,
};

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/booking-engine/specialists', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patchRequest(body: unknown): Request {
  return new Request(`http://localhost/api/admin/booking-engine/specialists/${SPECIALIST_ID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const routeParams = { params: Promise.resolve({ id: SPECIALIST_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requireGate.mockResolvedValue({
    ok: true,
    ctx: {
      organizationId: ORGANIZATION_ID,
      service: {
        catalog: {
          upsertSpecialist: fakes.upsertSpecialist,
          getSpecialist: fakes.getSpecialist,
          setSpecialistLocation: fakes.setSpecialistLocation,
        },
      },
    },
  });
  fakes.requireEntitlement.mockResolvedValue({ ok: true });
  fakes.getSpecialist.mockResolvedValue(existingSpecialist);
  fakes.upsertSpecialist.mockImplementation(async (input: { fullName: string }) => ({
    ...existingSpecialist,
    ...input,
  }));
});

describe('карточка специалиста: ФИО только кириллицей', () => {
  it('создание с латинским ФИО отказано, записи не происходит', async () => {
    const response = await createSpecialist(postRequest({ fullName: 'Ivan Ivanov' }));
    const body = (await response.json()) as { ok: boolean; message?: string };

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.message).toBe(FIO_LATIN_REJECTED_TEXT);
    expect(fakes.upsertSpecialist).not.toHaveBeenCalled();
  });

  it('создание с кириллическим ФИО проходит до записи', async () => {
    const response = await createSpecialist(postRequest({ fullName: 'Иванов Иван Иванович' }));

    expect(response.status).toBe(200);
    expect(fakes.upsertSpecialist).toHaveBeenCalledTimes(1);
    expect(fakes.upsertSpecialist.mock.calls[0][0]).toMatchObject({
      fullName: 'Иванов Иван Иванович',
    });
  });

  it('смешанное ФИО с одной латинской буквой тоже отказано', async () => {
    // «a» здесь латинская U+0061 — глазами не отличить, а имя получилось бы двух алфавитов.
    const response = await createSpecialist(postRequest({ fullName: 'Ивaнов Иван' }));

    expect(response.status).toBe(400);
    expect(fakes.upsertSpecialist).not.toHaveBeenCalled();
  });

  it('правка карточки на латинское ФИО отказана, сохранённое имя остаётся нетронутым', async () => {
    const response = await updateSpecialist(patchRequest({ fullName: 'John Smith' }), routeParams);
    const body = (await response.json()) as { ok: boolean; message?: string };

    expect(response.status).toBe(400);
    expect(body.message).toBe(FIO_LATIN_REJECTED_TEXT);
    expect(fakes.upsertSpecialist).not.toHaveBeenCalled();
  });

  it('правка без имени (например перетаскивание порядка) запретом не задета', async () => {
    const response = await updateSpecialist(patchRequest({ sortOrder: 20 }), routeParams);

    expect(response.status).toBe(200);
    expect(fakes.upsertSpecialist).toHaveBeenCalledTimes(1);
    expect(fakes.upsertSpecialist.mock.calls[0][0]).toMatchObject({
      fullName: existingSpecialist.fullName,
      sortOrder: 20,
    });
  });
});
