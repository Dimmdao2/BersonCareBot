/**
 * D17 финал. Читатели `public.*` больше не строят реляционный SQL — они зовут именованный корень.
 * Тест сторожит ровно то, что ломается молча: имя корня, ПОЛНЫЙ позиционный набор аргументов и
 * форму поиска (внешний id канала ЛИБО телефон, никогда оба сразу). Перестановка двух `text`-
 * аргументов — валидный SQL и зелёный деплой, а в базе поиск идёт не по тому ключу.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import {
  runWithBootstrapPrincipal,
  runWithOrganizationPrincipal,
} from '../../principal/organizationPrincipal.js';

const fakes = vi.hoisted(() => ({
  runNamedRoot: vi.fn(async (): Promise<{ rows: Record<string, unknown>[] }> => ({ rows: [] })),
}));

vi.mock('../runIntegratorSql.js', () => ({ runIntegratorNamedRoot: fakes.runNamedRoot }));

import {
  findChannelBindingByPhone,
  getChannelBindingLinkData,
  resolveActiveOrganizationIdForChannel,
  resolveCanonicalPlatformUserIdByChannel,
} from './platformUserByChannel.js';
import {
  getCanonicalPlatformUserDeliveryIdentity,
  getPhoneNormalizedForDeliveryLookup,
} from './platformUserDeliveryPhone.js';

const IDENTITY_ROOT = 'app.integrator_read_channel_binding_identity(text,text,text)';
const ORGANIZATION_ROOT = 'app.resolve_active_organization_for_channel_binding(text,text)';
const DELIVERY_ROOT = 'app.integrator_read_platform_user_delivery_identity(text)';

const ORG = 'a0000000-0000-4000-8000-000000000001';

const bindingRow = {
  platform_user_id: '093d8c23-1910-48f1-8f7f-ba2993004827',
  external_id: '957924152',
  display_handle: 'someone',
  phone_normalized: '+79060432251',
};

function answers(rows: Record<string, unknown>[]) {
  fakes.runNamedRoot.mockResolvedValue({ rows });
}

function callOf(index: number) {
  return fakes.runNamedRoot.mock.calls[index]?.slice(0, 3);
}

describe('integrator channel-binding identity reader', () => {
  beforeEach(() => vi.clearAllMocks());

  it('searches by the channel external id and never also by phone', async () => {
    const db = {} as DbPort;
    answers([bindingRow]);

    await expect(runWithOrganizationPrincipal(ORG, () =>
      getChannelBindingLinkData(db, { channelCode: 'telegram', externalId: '957924152' })))
      .resolves.toEqual({
        userId: bindingRow.platform_user_id,
        channelId: '957924152',
        chatId: 957924152,
        username: 'someone',
        phoneNormalized: '+79060432251',
      });
    expect(callOf(0)).toEqual([db, IDENTITY_ROOT, ['telegram', '957924152', null]]);
  });

  it('searches by the confirmed phone and never also by external id', async () => {
    const db = {} as DbPort;
    answers([bindingRow]);

    await expect(
      runWithOrganizationPrincipal(ORG, () =>
        findChannelBindingByPhone(db, { channelCode: 'channel', phoneNormalized: '+79060432251' })),
    ).resolves.toEqual({
      userId: bindingRow.platform_user_id,
      channelId: '957924152',
      chatId: 957924152,
      username: 'someone',
      phoneNormalized: '+79060432251',
    });
    // `channel` — псевдоним телеграма у прежнего вызывающего; корень получает реальный канал.
    expect(callOf(0)).toEqual([db, IDENTITY_ROOT, ['telegram', null, '+79060432251']]);
  });

  it('returns the canonical id alone when only the person is asked for', async () => {
    const db = {} as DbPort;
    answers([bindingRow]);

    await expect(
      runWithOrganizationPrincipal(ORG, () =>
        resolveCanonicalPlatformUserIdByChannel(db, { channelCode: 'max', externalId: '42' })),
    ).resolves.toBe(bindingRow.platform_user_id);
    expect(callOf(0)).toEqual([db, IDENTITY_ROOT, ['max', '42', null]]);
  });

  it('fails closed when the door answers with no row', async () => {
    const db = {} as DbPort;
    answers([]);

    await runWithOrganizationPrincipal(ORG, async () => {
      await expect(getChannelBindingLinkData(db, { channelCode: 'telegram', externalId: '1' }))
        .resolves.toBeNull();
      await expect(findChannelBindingByPhone(db, { channelCode: 'telegram', phoneNormalized: '+7' }))
        .resolves.toBeNull();
      await expect(resolveCanonicalPlatformUserIdByChannel(db, { channelCode: 'telegram', externalId: '1' }))
        .resolves.toBeNull();
    });
  });

  // Стена корня берёт клинику из принятого контекста, а bootstrap-принципал её по контракту не
  // несёт — значит читать нечем, и дверь не открывается вовсе. Прежде сюда улетал бросок, который
  // не ловил никто до `eventGateway`: человек не получал НИ ОДНОГО ответа на своё сообщение.
  it('never opens the door without a tenant, and answers "not identified" instead', async () => {
    const db = {} as DbPort;
    answers([bindingRow]);

    await runWithBootstrapPrincipal({ source: 'telegram-webhook:unresolved-org' }, async () => {
      await expect(getChannelBindingLinkData(db, { channelCode: 'telegram', externalId: '957924152' }))
        .resolves.toBeNull();
      await expect(findChannelBindingByPhone(db, { channelCode: 'telegram', phoneNormalized: '+79060432251' }))
        .resolves.toBeNull();
      await expect(resolveCanonicalPlatformUserIdByChannel(db, { channelCode: 'max', externalId: '42' }))
        .resolves.toBeNull();
    });
    expect(fakes.runNamedRoot).not.toHaveBeenCalled();
  });
});

describe('integrator channel organization pre-routing resolver', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks the bootstrap door for one organization id', async () => {
    const db = {} as DbPort;
    answers([{ organization_id: 'a0000000-0000-4000-8000-000000000001' }]);

    await expect(
      resolveActiveOrganizationIdForChannel(db, { channelCode: 'telegram', externalId: '957924152' }),
    ).resolves.toBe('a0000000-0000-4000-8000-000000000001');
    expect(callOf(0)).toEqual([db, ORGANIZATION_ROOT, ['telegram', '957924152']]);
  });

  it('fails closed when the door returns no organization', async () => {
    const db = {} as DbPort;
    answers([{ organization_id: null }]);

    await expect(
      resolveActiveOrganizationIdForChannel(db, { channelCode: 'telegram', externalId: '1' }),
    ).resolves.toBeNull();
  });
});

describe('integrator platform-user delivery identity reader', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts the canonical uuid key', async () => {
    const db = {} as DbPort;
    answers([{ phone_normalized: '+79060432251', integrator_user_id: '126' }]);

    await expect(
      getCanonicalPlatformUserDeliveryIdentity(db, bindingRow.platform_user_id),
    ).resolves.toEqual({ phoneNormalized: '+79060432251', integratorUserId: '126' });
    expect(callOf(0)).toEqual([db, DELIVERY_ROOT, [bindingRow.platform_user_id]]);
  });

  it('accepts the numeric integrator key through the same door', async () => {
    const db = {} as DbPort;
    answers([{ phone_normalized: '+79060432251', integrator_user_id: '126' }]);

    await expect(getPhoneNormalizedForDeliveryLookup(db, ' 126 ')).resolves.toBe('+79060432251');
    expect(callOf(0)).toEqual([db, DELIVERY_ROOT, ['126']]);
  });

  it('separates "no person" from "person without a phone"', async () => {
    const db = {} as DbPort;
    answers([{ phone_normalized: null, integrator_user_id: '126' }]);
    await expect(
      getCanonicalPlatformUserDeliveryIdentity(db, bindingRow.platform_user_id),
    ).resolves.toEqual({ phoneNormalized: null, integratorUserId: '126' });
    await expect(getPhoneNormalizedForDeliveryLookup(db, bindingRow.platform_user_id))
      .resolves.toBeNull();

    answers([]);
    await expect(
      getCanonicalPlatformUserDeliveryIdentity(db, bindingRow.platform_user_id),
    ).resolves.toBeNull();
  });

  it('never opens the door for an empty key', async () => {
    const db = {} as DbPort;
    await expect(getPhoneNormalizedForDeliveryLookup(db, '   ')).resolves.toBeNull();
    expect(fakes.runNamedRoot).not.toHaveBeenCalled();
  });
});
