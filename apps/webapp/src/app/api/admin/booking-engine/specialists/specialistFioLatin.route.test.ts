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

const legacyLatinSpecialist = {
  ...existingSpecialist,
  fullName: 'John Smith',
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

function expectReadableRejection(body: { ok: boolean; error?: string; message?: string }): void {
  expect(body.ok).toBe(false);
  expect(body.error).toBe('invalid_input');
  expect(body.message).toEqual(expect.any(String));
  expect(body.message?.trim()).not.toBe('');
  expect(body.message).not.toBe(body.error);
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
    const body = (await response.json()) as {
      ok: boolean;
      error?: string;
      message?: string;
    };

    expect(response.status).toBe(400);
    expectReadableRejection(body);
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

  it('правка карточки на смешанное ФИО тоже отказана', async () => {
    const response = await updateSpecialist(
      patchRequest({ fullName: 'Ивaнов Иван' }),
      routeParams,
    );

    expect(response.status).toBe(400);
    expect(fakes.upsertSpecialist).not.toHaveBeenCalled();
  });

  it('правка карточки на кириллическое ФИО проходит до записи', async () => {
    const response = await updateSpecialist(
      patchRequest({ fullName: 'Петров Пётр Петрович' }),
      routeParams,
    );

    expect(response.status).toBe(200);
    expect(fakes.upsertSpecialist).toHaveBeenCalledTimes(1);
    expect(fakes.upsertSpecialist.mock.calls[0][0]).toMatchObject({
      fullName: 'Петров Пётр Петрович',
    });
  });

  it('правка карточки на латинское ФИО отказана, сохранённое имя остаётся нетронутым', async () => {
    const response = await updateSpecialist(patchRequest({ fullName: 'John Smith' }), routeParams);
    const body = (await response.json()) as {
      ok: boolean;
      error?: string;
      message?: string;
    };

    expect(response.status).toBe(400);
    expectReadableRejection(body);
    expect(fakes.upsertSpecialist).not.toHaveBeenCalled();
  });

  it.each([
    ['перетаскивание порядка', { sortOrder: 20 }],
    ['публикация карточки', { cardIsPublished: true }],
    ['выключение специалиста', { isActive: false }],
  ])('правка без имени (%s) сохраняет старое латинское ФИО', async (_label, patch) => {
    fakes.getSpecialist.mockResolvedValue(legacyLatinSpecialist);

    const response = await updateSpecialist(patchRequest(patch), routeParams);

    expect(response.status).toBe(200);
    expect(fakes.upsertSpecialist).toHaveBeenCalledTimes(1);
    expect(fakes.upsertSpecialist.mock.calls[0][0]).toMatchObject({
      ...patch,
      fullName: legacyLatinSpecialist.fullName,
    });
  });
});
