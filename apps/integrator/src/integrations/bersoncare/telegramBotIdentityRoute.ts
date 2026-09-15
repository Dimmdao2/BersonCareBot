/**
 * M2M: webapp спрашивает, КАК НАЗЫВАЕТСЯ бот, которому принадлежит сохранённый токен.
 *
 * Зачем отдельная дверь. Имя бота (`telegram_login_bot_username`, `botPublicId` клиники) до сих пор
 * вводили руками рядом с токеном, и ничто их не связывало: владелец 16.09.2026 получил в бою чужого
 * бота — «там оказывается был какой то левый бот» — и код входа молча не доходил. Его решение:
 * «не понимаю почему нельзя его просто получать по токену не спрашивая… при сохранении требовать
 * ввода всех значений и проверять корректность имени по токену».
 *
 * Почему в интеграторе, а не в webapp: в мессенджеры ходит только интегратор (webapp не знает ни
 * одного адреса Bot API), и токены он читает сам из настроек. Поэтому запрос несёт лишь АДРЕСАЦИЮ —
 * платформенная аудитория или организация, — а сам токен через сеть не передаётся и в логи не
 * попадает. Подпись — как у relay-outbound / request-contact.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { logger } from '../../infra/observability/logger.js';
import { fetchTelegramBotIdentity } from '../telegram/client.js';
import {
  getTelegramLoginWidgetBotToken,
  getTelegramRuntimeConfig,
} from '../../infra/adapters/integrationRuntimeConfig.js';
import { runWithOptionalOrganizationPrincipal } from '../../infra/principal/organizationPrincipal.js';
import type { ClinicDeliveryCredential } from '../../infra/db/clinicDeliveryCredentials.js';

const WINDOW_SECONDS = 300;

const bodySchema = z.union([
  z.object({
    scope: z.literal('platform'),
    audience: z.enum(['staff', 'patient']),
  }),
  /** Бот Login Widget: своя личность, свой токен, доставкой не занимается. */
  z.object({
    scope: z.literal('platform_login_widget'),
  }),
  z.object({
    scope: z.literal('clinic'),
    organizationId: z.string().uuid(),
  }),
]);

type Body = z.infer<typeof bodySchema>;
type ReqWithRawBody = FastifyRequest<{ Body: Body }> & { rawBody?: string };

function verifySignature(
  timestamp: string,
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > WINDOW_SECONDS) return false;
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('base64url');
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type BersoncareTelegramBotIdentityDeps = {
  sharedSecret: string;
  /** Тот же резолвер, что и у доставки: тариф, принципал организации и живая проверка — общие. */
  resolveClinicDeliveryCredential: (
    channel: 'telegram',
    options: { allowUnverified?: boolean },
  ) => Promise<ClinicDeliveryCredential | null>;
};

export async function registerBersoncareTelegramBotIdentityRoute(
  app: FastifyInstance,
  deps: BersoncareTelegramBotIdentityDeps,
): Promise<void> {
  const { sharedSecret, resolveClinicDeliveryCredential } = deps;

  if (!app.hasContentTypeParser('application/json')) {
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
      const raw: string = typeof body === 'string' ? body : (body as Buffer).toString('utf8');
      (req as ReqWithRawBody).rawBody = raw;
      try {
        done(null, JSON.parse(raw) as Body);
      } catch (e) {
        done(e as Error, undefined);
      }
    });
  }

  app.post<{ Body: Body }>('/api/bersoncare/telegram-bot-identity', async (request, reply) => {
    const req = request as ReqWithRawBody;
    const rawBody = req.rawBody ?? JSON.stringify(request.body ?? {});
    const timestamp = request.headers['x-bersoncare-timestamp'];
    const signature = request.headers['x-bersoncare-signature'];

    if (typeof timestamp !== 'string' || typeof signature !== 'string') {
      return reply.code(400).send({ ok: false, error: 'missing_headers' });
    }
    if (!sharedSecret) {
      logger.warn({}, 'bersoncare telegram-bot-identity: webhook secret not set');
      return reply.code(503).send({ ok: false, error: 'service_unconfigured' });
    }
    if (!verifySignature(timestamp, rawBody, signature, sharedSecret)) {
      return reply.code(401).send({ ok: false, error: 'invalid_signature' });
    }

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    }

    let botToken = '';
    if (parsed.data.scope === 'platform') {
      const runtime = await getTelegramRuntimeConfig(parsed.data.audience);
      botToken = runtime.enabled ? runtime.botToken : '';
    } else if (parsed.data.scope === 'platform_login_widget') {
      botToken = await getTelegramLoginWidgetBotToken();
    } else {
      // `allowUnverified`: имя спрашивают сразу после сохранения токена, до живой проверки канала —
      // иначе настроить бота было бы нельзя в принципе.
      const credential = await runWithOptionalOrganizationPrincipal(
        parsed.data.organizationId,
        () => resolveClinicDeliveryCredential('telegram', { allowUnverified: true }),
      );
      botToken = credential?.channel === 'telegram' ? credential.botToken : '';
    }
    if (!botToken) {
      return reply.code(200).send({ ok: false, error: 'credential_missing' });
    }

    const identity = await fetchTelegramBotIdentity(botToken);
    if (!identity.ok) {
      // Причина — классифицированная, без тела ответа Telegram: в нём может оказаться сам токен.
      logger.warn(
        { scope: parsed.data.scope, reason: identity.error },
        'telegram bot identity failed',
      );
      return reply.code(200).send({ ok: false, error: identity.error });
    }
    return reply.code(200).send({ ok: true, username: identity.username, botId: identity.botId });
  });
}
