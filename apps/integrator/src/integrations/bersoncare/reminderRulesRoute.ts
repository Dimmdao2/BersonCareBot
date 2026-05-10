import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { DbWritePort } from '../../kernel/contracts/index.js';
import { logger } from '../../infra/observability/logger.js';

const WINDOW_SECONDS = 300;

const payloadSchema = z.object({
  integratorRuleId: z.string().min(1),
  integratorUserId: z.union([z.string().min(1), z.number().int()]).transform((value) => String(value)),
  category: z.string().min(1),
  isEnabled: z.boolean(),
  scheduleType: z.string().min(1),
  timezone: z.string().min(1),
  intervalMinutes: z.number().int().positive(),
  windowStartMinute: z.number().int().min(0).max(1439),
  windowEndMinute: z.number().int().min(1).max(1440),
  daysMask: z.string().regex(/^[01]{7}$/),
  contentMode: z.string().min(1),
  linkedObjectType: z.string().nullable().optional(),
  linkedObjectId: z.string().nullable().optional(),
  customTitle: z.string().nullable().optional(),
  customText: z.string().nullable().optional(),
  deepLink: z.string().nullable().optional(),
  scheduleData: z.unknown().optional(),
  reminderIntent: z.string().nullable().optional(),
  quietHoursStartMinute: z.union([z.number().int().min(0).max(1439), z.null()]).optional(),
  quietHoursEndMinute: z.union([z.number().int().min(1).max(1440), z.null()]).optional(),
  notificationTopicCode: z.union([z.string().max(64), z.null()]).optional(),
});

const bodySchema = z.object({
  eventType: z.literal('reminder.rule.upserted'),
  idempotencyKey: z.string().min(1).optional(),
  payload: payloadSchema,
});

type ReminderRuleUpsertBody = z.infer<typeof bodySchema>;
type ReqWithRawBody = FastifyRequest<{ Body: ReminderRuleUpsertBody }> & { rawBody?: string };

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

export type BersoncareReminderRulesDeps = {
  writePort: DbWritePort;
  sharedSecret: string;
};

export async function registerBersoncareReminderRulesRoute(
  app: FastifyInstance,
  deps: BersoncareReminderRulesDeps,
): Promise<void> {
  const { writePort, sharedSecret } = deps;

  if (!app.hasContentTypeParser('application/json')) {
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
      const raw: string = typeof body === 'string' ? body : (body as Buffer).toString('utf8');
      (req as ReqWithRawBody).rawBody = raw;
      try {
        done(null, JSON.parse(raw) as ReminderRuleUpsertBody);
      } catch (err) {
        done(err as Error, undefined);
      }
    });
  }

  app.post<{ Body: ReminderRuleUpsertBody }>('/api/integrator/reminders/rules', async (request, reply) => {
    const req = request as ReqWithRawBody;
    const rawBody = req.rawBody ?? JSON.stringify(request.body ?? {});
    const timestamp = request.headers['x-bersoncare-timestamp'];
    const signature = request.headers['x-bersoncare-signature'];

    if (typeof timestamp !== 'string' || typeof signature !== 'string') {
      return reply.code(400).send({ ok: false, error: 'missing_headers' });
    }
    if (!sharedSecret) {
      logger.warn({}, 'bersoncare reminders/rules: webhook secret not set');
      return reply.code(503).send({ ok: false, error: 'service_unconfigured' });
    }
    if (!verifySignature(timestamp, rawBody, signature, sharedSecret)) {
      return reply.code(401).send({ ok: false, error: 'invalid_signature' });
    }

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    }

    const payload = parsed.data.payload;
    if (payload.scheduleType !== 'slots_v1' && payload.windowStartMinute >= payload.windowEndMinute) {
      return reply.code(400).send({ ok: false, error: 'invalid_window' });
    }

    try {
      await writePort.writeDb({
        type: 'reminders.rule.upsert',
        params: {
          id: payload.integratorRuleId,
          userId: payload.integratorUserId,
          category: payload.category,
          isEnabled: payload.isEnabled,
          scheduleType: payload.scheduleType,
          timezone: payload.timezone,
          intervalMinutes: payload.intervalMinutes,
          windowStartMinute: payload.windowStartMinute,
          windowEndMinute: payload.windowEndMinute,
          daysMask: payload.daysMask,
          contentMode: payload.contentMode,
          linkedObjectType: payload.linkedObjectType ?? null,
          linkedObjectId: payload.linkedObjectId ?? null,
          customTitle: payload.customTitle ?? null,
          customText: payload.customText ?? null,
          deepLink: payload.deepLink ?? null,
          scheduleData: payload.scheduleData,
          reminderIntent: payload.reminderIntent ?? null,
          quietHoursStartMinute: payload.quietHoursStartMinute ?? null,
          quietHoursEndMinute: payload.quietHoursEndMinute ?? null,
          ...(payload.notificationTopicCode !== undefined
            ? {
                notificationTopicCode:
                  typeof payload.notificationTopicCode === 'string'
                    ? payload.notificationTopicCode.trim() || null
                    : payload.notificationTopicCode,
              }
            : {}),
        },
      });
      return reply.code(200).send({ ok: true });
    } catch (err) {
      logger.error({ err }, 'bersoncare reminders/rules: write failed');
      return reply.code(502).send({ ok: false, error: 'write_failed' });
    }
  });
}
