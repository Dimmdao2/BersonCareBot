import { createHmac } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  DeliveryAdapter,
  IdempotencyPort,
  OutgoingIntent,
} from '../../kernel/contracts/index.js';
import { createDefaultDispatchPort } from '../../infra/adapters/dispatchPort.js';
import { registerBersoncareRelayOutboundRoute } from './relayOutboundRoute.js';

/**
 * Audit C3 круг 3, оракул IMPLEMENTATION_PLAN §1.2h: «На пути по умолчанию клиника не настраивает
 * НИЧЕГО». Legacy-ветка `doctorSupportMessagingService.sendAdminReply` (диалог без platform_user_id)
 * шлёт ровно такое тело relay-outbound. Здесь проверяется ВСЯ цепочка тем же маршрутом, каким
 * ходит вебапп: подписанное тело → zod-схема → buildIntent → настоящий dispatchPort → адаптер.
 *
 * Ловит две конкретные поломки:
 *  1. клиника БЕЗ своего бота: маркер `clinic_required` (или потеря маркера на любом хопе, дающая
 *     тот же эффект) → dispatch бросает CLINIC_CHANNEL_NOT_CONFIGURED → врач видит «отправлено»
 *     (ошибка гасится в `.catch(logger.error)`), пациент не получает НИЧЕГО;
 *  2. клиника СО своим ботом: отказ клинического бота приводит к повторной отправке платформенным —
 *     пациент получает сообщение от чужого бренда.
 */

const SHARED_SECRET = 'audit3-legacy-default-path';
const ROUTE = '/api/bersoncare/relay-outbound';
const ORG_ID = 'b7f4d2a1-9c60-4e31-8a55-2f0d6c91e784';
const PATIENT_CHAT_ID = '778899001';

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function memoryIdempotencyPort(): IdempotencyPort {
  const seen = new Set<string>();
  return {
    tryAcquire: async (key: string) => (seen.has(key) ? false : (seen.add(key), true)),
    release: async (key: string) => void seen.delete(key),
  };
}

/** Тело один-в-один как его собирает legacy-ветка sendAdminReply. */
function legacyDoctorReplyBody(channel: 'telegram' | 'max', idempotencyKey: string) {
  return {
    messageId: 'integrator-msg-audit3',
    organizationId: ORG_ID,
    channel,
    recipient: PATIENT_CHAT_ID,
    text: 'Специалист ответил вам в чате.\n\nhttps://app.example.test/patient/messages',
    idempotencyKey,
    senderScope: 'clinic_if_configured' as const,
  };
}

async function post(app: FastifyInstance, body: unknown) {
  const rawBody = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', SHARED_SECRET)
    .update(timestamp)
    .update('.')
    .update(rawBody)
    .digest('base64url');
  return app.inject({
    method: 'POST',
    url: ROUTE,
    headers: {
      'content-type': 'application/json',
      'x-bersoncare-timestamp': timestamp,
      'x-bersoncare-signature': signature,
    },
    payload: rawBody,
  });
}

async function buildApp(params: {
  send: DeliveryAdapter['send'];
  credential: Awaited<ReturnType<NonNullable<Parameters<typeof createDefaultDispatchPort>[0]['resolveClinicDeliveryCredential']>>>;
}) {
  const dispatchPort = createDefaultDispatchPort({
    adapters: [{ canHandle: () => true, send: params.send }],
    resolveClinicDeliveryCredential: async () => params.credential,
  });
  const app = Fastify({ logger: false });
  apps.push(app);
  await registerBersoncareRelayOutboundRoute(app, {
    dispatchPort: { dispatchOutgoing: dispatchPort.dispatchOutgoing },
    sharedSecret: SHARED_SECRET,
    idempotencyPort: memoryIdempotencyPort(),
  });
  return app;
}

describe('audit C3-3: legacy doctor reply on the default path', () => {
  it.each(['telegram', 'max'] as const)(
    'a %s clinic that configured NOTHING still delivers the reply through the platform bot',
    async (channel) => {
      const send = vi.fn(async (_intent: OutgoingIntent) => ({}));
      const app = await buildApp({ send, credential: null });

      const response = await post(app, legacyDoctorReplyBody(channel, `audit3-none-${channel}`));

      expect(response.statusCode).toBe(200);
      expect(send).toHaveBeenCalledOnce();
      // Платформенный бот: клинический кредентиал в payload НЕ подставлен.
      expect(
        (send.mock.calls[0]?.[0].payload as { delivery?: Record<string, unknown> }).delivery,
      ).not.toHaveProperty('clinicCredential');
    },
  );

  it('a clinic WITH its own telegram bot sends through that bot', async () => {
    const send = vi.fn(async (_intent: OutgoingIntent) => ({}));
    const app = await buildApp({
      send,
      credential: { channel: 'telegram', botToken: 'audit3-clinic-bot-token' },
    });

    const response = await post(app, legacyDoctorReplyBody('telegram', 'audit3-own-bot'));

    expect(response.statusCode).toBe(200);
    expect(send).toHaveBeenCalledOnce();
    expect(
      (send.mock.calls[0]?.[0].payload as { delivery?: Record<string, unknown> }).delivery,
    ).toMatchObject({ clinicCredential: { channel: 'telegram', botToken: 'audit3-clinic-bot-token' } });
  });

  it('a clinic WITH its own bot never falls back to the platform bot when that bot fails', async () => {
    const send = vi.fn(async (intent: OutgoingIntent) => {
      const delivery = (intent.payload as { delivery?: Record<string, unknown> }).delivery;
      if (delivery && 'clinicCredential' in delivery) throw new Error('CLINIC_BOT_BLOCKED');
      return {};
    });
    const app = await buildApp({
      send,
      credential: { channel: 'max', apiKey: 'audit3-clinic-max-key' },
    });

    const response = await post(app, legacyDoctorReplyBody('max', 'audit3-own-bot-fails'));

    // Один вызов адаптера — клиническим отправителем. Второго, платформенного, быть не должно.
    expect(send).toHaveBeenCalledOnce();
    expect(response.statusCode).not.toBe(200);
  });
});
