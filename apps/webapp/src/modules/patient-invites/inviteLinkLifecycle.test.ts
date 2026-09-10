/**
 * Жизнь ссылки приглашения: пока она жива — она ОДНА и та же.
 *
 * Владелец 10.09.2026, дословно: «не надо писать „выпустить новую ссылку“… просто если эта ссылка
 * уже создана, её не надо переделывать, надо просто её снова показать… когда она истечёт, тогда
 * просто происходит создание новой».
 *
 * Поломка, которую ловит этот файл, дорогая и молчаливая: повторное нажатие «Пригласить» выпускало
 * новое приглашение и гасило прежнее — то есть ОТЗЫВАЛО ссылку, которую специалист уже отправил
 * человеку. Снаружи это выглядит как «пациент говорит, что ссылка не работает», а в кабинете всё
 * зелено.
 */
import { describe, expect, it, vi } from 'vitest';
import { createPatientInvitesService, patientInviteRelativeUrl } from './service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-0000000000a1';
const PATIENT_ID = '00000000-0000-4000-8000-0000000000b1';
const LIVE_INVITE_ID = '00000000-0000-4000-8000-0000000000c1';

function serviceWith(status: {
  status: 'not_activated' | 'invited' | 'linked';
  inviteId: string | null;
  expiresAt: string | null;
}) {
  const createReplacingPending = vi.fn(async (input: { id: string }) => ({
    ok: true as const,
    invite: { id: input.id, expiresAt: '2026-09-20T00:00:00.000Z' },
  }));
  const port = {
    getPortalStatus: vi.fn().mockResolvedValue(status),
    createReplacingPending,
  };
  return {
    createReplacingPending,
    service: createPatientInvitesService({ port: port as never }),
  };
}

const issueInput = {
  organizationId: ORGANIZATION_ID,
  patientUserId: PATIENT_ID,
  invitedEmail: null,
  createdByPlatformUserId: '00000000-0000-4000-8000-0000000000d1',
};

describe('ссылка приглашения', () => {
  it('повторное «Пригласить» отдаёт ТУ ЖЕ ссылку и не трогает выданное приглашение', async () => {
    const world = serviceWith({
      status: 'invited',
      inviteId: LIVE_INVITE_ID,
      expiresAt: '2026-09-20T00:00:00.000Z',
    });

    const result = await world.service.issue(issueInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.relativeUrl).toBe(patientInviteRelativeUrl(LIVE_INVITE_ID));
    // Главное: прежнее приглашение НЕ заменено, значит ранее отправленная ссылка жива.
    expect(world.createReplacingPending).not.toHaveBeenCalled();
  });

  it('без живого приглашения выпускает новое, и ссылка выводится из него же', async () => {
    const world = serviceWith({ status: 'not_activated', inviteId: null, expiresAt: null });

    const result = await world.service.issue(issueInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(world.createReplacingPending).toHaveBeenCalledTimes(1);
    const created = world.createReplacingPending.mock.calls[0]?.[0] as { id: string };
    expect(result.relativeUrl).toBe(patientInviteRelativeUrl(created.id));
  });

  it('секрет не выводится из идентификатора без серверного перца', () => {
    // Разные приглашения — разные ссылки, и в самой ссылке идентификатора не видно: иначе она
    // выводилась бы из строки базы, и утечки одной только таблицы хватило бы, чтобы войти.
    const first = patientInviteRelativeUrl(LIVE_INVITE_ID);
    const second = patientInviteRelativeUrl('00000000-0000-4000-8000-0000000000c2');
    expect(first).not.toBe(second);
    expect(first).not.toContain(LIVE_INVITE_ID);
  });
});
