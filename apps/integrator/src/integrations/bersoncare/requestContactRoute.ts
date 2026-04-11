/**
 * M2M: webapp просит интегратор отправить в чат запрос контакта (Telegram reply keyboard / MAX inline request_contact).
 * Подпись — как relay-outbound / send-otp.
 *
 * **Дедуп `idempotencyKey`:** `dedupMap` в памяти процесса (см. `DEDUP_TTL_MS`). Не shared между репликами — см. `INTEGRATOR_CONTRACT.md` Flow 6b.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { DbPort, DispatchPort } from '../../kernel/contracts/index.js';
import { logger } from '../../infra/observability/logger.js';
import { setUserState } from '../../infra/db/repos/channelUsers.js';

const WINDOW_SECONDS = 300;
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000;

/** Синхронно с telegram:user/templates.json */
const CONFIRM_TEXT =
  'Для работы с ботом и приложением необходимо привязать номер телефона. Это позволит вам получить доступ к своим данным на любой платформе: Телеграм, Max, мобильное веб-приложение и в обычном браузере.';
const CONTACT_BUTTON_TEXT = '📲 Отправить номер телефона';

const bodySchema = z.object({
  channel: z.enum(['telegram', 'max']),
  /** Внешний id пользователя в канале (= chat id для лички TG/MAX). */
  recipientId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

type Body = z.infer<typeof bodySchema>;
type ReqWithRawBody = FastifyRequest<{ Body: Body }> & { rawBody?: string };

function verifySignature(timestamp: string, rawBody: string, signature: string, secret: string): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > WINDOW_SECONDS) return false;
  const payload = `${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}

function telegramReplyMarkup() {
  return {
    keyboard: [[{ text: CONTACT_BUTTON_TEXT, request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

/** MAX API: inline_keyboard с кнопкой type request_contact. */
function maxInlineReplyMarkup() {
  return {
    inline_keyboard: [
      [{ text: 'Поделиться номером телефона', request_contact: true } as Record<string, unknown>],
    ],
  };
}

export type BersoncareRequestContactDeps = {
  dispatchPort: DispatchPort;
  sharedSecret: string;
  db: DbPort;
};

export async function registerBersoncareRequestContactRoute(
  app: FastifyInstance,
  deps: BersoncareRequestContactDeps,
): Promise<void> {
  const { dispatchPort, sharedSecret, db } = deps;
  /** In-process only; see module JSDoc. */
  const dedupMap = new Map<string, number>();

  function isDuplicate(key: string): boolean {
    const exp = dedupMap.get(key);
    if (exp === undefined) return false;
    if (Date.now() > exp) {
      dedupMap.delete(key);
      return false;
    }
    return true;
  }

  function registerKey(key: string): void {
    dedupMap.set(key, Date.now() + DEDUP_TTL_MS);
  }

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

  app.post<{ Body: Body }>('/api/bersoncare/request-contact', async (request, reply) => {
    const req = request as ReqWithRawBody;
    const rawBody = req.rawBody ?? JSON.stringify(request.body ?? {});
    const timestamp = request.headers['x-bersoncare-timestamp'];
    const signature = request.headers['x-bersoncare-signature'];

    if (typeof timestamp !== 'string' || typeof signature !== 'string') {
      return reply.code(400).send({ ok: false, error: 'missing_headers' });
    }
    if (!sharedSecret) {
      logger.warn({}, 'bersoncare request-contact: webhook secret not set');
      return reply.code(503).send({ ok: false, error: 'service_unconfigured' });
    }
    if (!verifySignature(timestamp, rawBody, signature, sharedSecret)) {
      return reply.code(401).send({ ok: false, error: 'invalid_signature' });
    }

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    }

    const { channel, recipientId, idempotencyKey } = parsed.data;
    if (isDuplicate(idempotencyKey)) {
      logger.info({ idempotencyKey }, 'request-contact: duplicate, skipping');
      return reply.code(200).send({ ok: true, status: 'duplicate' });
    }

    if (channel === 'telegram') {
      await setUserState(db, recipientId, 'await_contact:subscription');
    }
    // MAX: `setUserState` в БД интегратора завязан на `identities.resource='telegram'`; состояние MAX ведёт сценарий канала отдельно.

    const eventId = `request-contact:${channel}:${randomUUID()}`;
    const replyMarkup = channel === 'telegram' ? telegramReplyMarkup() : maxInlineReplyMarkup();

    const intent = {
      type: 'message.send' as const,
      meta: {
        eventId,
        occurredAt: new Date().toISOString(),
        source: channel,
        correlationId: idempotencyKey,
      },
      payload: {
        recipient: { chatId: recipientId },
        message: { text: CONFIRM_TEXT },
        replyMarkup,
        delivery: { channels: [channel] },
      },
    };

    try {
      await dispatchPort.dispatchOutgoing(intent);
      registerKey(idempotencyKey);
      logger.info({ channel }, 'request-contact: dispatched');
      return reply.code(200).send({ ok: true, status: 'accepted' });
    } catch (err) {
      const codeErr = (err as { code?: number }).code ?? 0;
      const isClientError = codeErr >= 400 && codeErr < 500;
      logger.error({ err, channel }, 'request-contact: dispatch failed');
      if (isClientError) {
        return reply.code(400).send({ ok: false, error: 'dispatch_client_error' });
      }
      return reply.code(502).send({ ok: false, error: 'dispatch_failed' });
    }
  });
}
