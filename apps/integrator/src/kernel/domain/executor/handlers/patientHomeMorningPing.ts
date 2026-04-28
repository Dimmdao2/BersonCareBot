import { DateTime } from 'luxon';
import type { Action, ActionResult, DomainContext, DbPort } from '../../../contracts/index.js';
import type { OutgoingIntent } from '../../../contracts/events.js';
import type { ExecutorDeps } from '../helpers.js';
import { nowIso } from '../helpers.js';
import { createDbPort } from '../../../../infra/db/client.js';
import {
  hasPublishedDailyWarmupContentPage,
  listMorningPingRecipients,
  tryAcquireMorningPingKey,
} from '../../../../infra/db/repos/patientHomeMorningPing.js';
import { getAppBaseUrl } from '../../../../config/appBaseUrl.js';
import { getAppDisplayTimezone } from '../../../../config/appTimezone.js';
import { buildWebappEntryUrl, buildWebappEntryUrlForMax } from '../../../../integrations/webappEntryToken.js';
import { logger } from '../../../../infra/observability/logger.js';

const PING_TEXT = 'Доброе утро! Разминка дня готова — 3 минуты. Открыть?';
const KEY_ENABLED = 'patient_home_morning_ping_enabled';
const KEY_TIME = 'patient_home_morning_ping_local_time';

async function readAdminScalar(db: DbPort, key: string): Promise<unknown | null> {
  const res = await db.query<{ value_json: unknown }>(
    `SELECT value_json FROM system_settings WHERE key = $1 AND scope = 'admin' LIMIT 1`,
    [key],
  );
  const row = res.rows[0];
  if (!row) return null;
  const v = row.value_json;
  if (v !== null && typeof v === 'object' && 'value' in v) {
    return (v as { value: unknown }).value;
  }
  return null;
}

function parsePingEnabled(raw: unknown): boolean {
  if (raw === true) return true;
  if (raw === false) return false;
  if (raw === 'true' || raw === 1) return true;
  if (raw === 'false' || raw === 0) return false;
  return false;
}

function parsePingTime(raw: unknown): { hour: number; minute: number } {
  if (typeof raw !== 'string') return { hour: 9, minute: 0 };
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw.trim());
  if (!m) return { hour: 9, minute: 0 };
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

function localDateKeyInZone(now: Date, iana: string): string {
  return DateTime.fromJSDate(now).setZone(iana).toISODate() ?? '';
}

function isWithinDueWindow(
  now: DateTime,
  wantHour: number,
  wantMinute: number,
  dueWindowMinutes: number,
): boolean {
  const target = now.set({ hour: wantHour, minute: wantMinute, second: 0, millisecond: 0 });
  if (!target.isValid) return false;
  const end = target.plus({ minutes: Math.max(1, Math.trunc(dueWindowMinutes)) });
  return now >= target && now < end;
}

/**
 * Phase 8: global morning ping for daily warmup (schedule.tick second step). Idempotent per user per local day.
 *
 * When `deps.queuePort` is set (production pipeline), each send is enqueued as `message.deliver` with staggered
 * `runAt` via retry backoff — avoids blocking the scheduler tick on many synchronous bot API calls.
 * Without `queuePort` (unit tests), falls back to returning `message.send` intents.
 */
export async function handlePatientHomeMorningPing(
  action: Action,
  ctx: DomainContext,
  deps: ExecutorDeps,
): Promise<ActionResult> {
  const db = createDbPort();
  const enabledRaw = await readAdminScalar(db, KEY_ENABLED);
  if (!parsePingEnabled(enabledRaw)) {
    return { actionId: action.id, status: 'skipped', values: { reason: 'morning_ping_disabled' } };
  }

  const appTz = await getAppDisplayTimezone({
    db,
    ...(deps.dispatchPort ? { dispatchPort: deps.dispatchPort } : {}),
  });
  const { hour: wantH, minute: wantM } = parsePingTime(await readAdminScalar(db, KEY_TIME));
  const dueWindowMinutes = 2;
  const nowDt = DateTime.now().setZone(appTz);
  if (!isWithinDueWindow(nowDt, wantH, wantM, dueWindowMinutes)) {
    return { actionId: action.id, status: 'skipped', values: { reason: 'not_ping_minute' } };
  }

  const hasWarmup = await hasPublishedDailyWarmupContentPage(db);
  if (!hasWarmup) {
    logger.warn('[patient_home.morningWarmupPing] skip: no published daily_warmup content_page');
    return { actionId: action.id, status: 'skipped', values: { reason: 'no_daily_warmup' } };
  }

  const baseUrl = await getAppBaseUrl(db);
  const rawLim = action.params.batchLimit;
  const limNum =
    typeof rawLim === 'number' && Number.isFinite(rawLim) ? Math.trunc(rawLim)
    : typeof rawLim === 'string' && /^\d+$/.test(rawLim.trim()) ? Number.parseInt(rawLim.trim(), 10)
    : 60;
  const limit = Math.min(100, Math.max(1, limNum));
  const recipients = await listMorningPingRecipients(db, limit);
  const dateKey = localDateKeyInZone(new Date(), appTz);
  const occurredAt = nowIso(ctx);
  const intents: OutgoingIntent[] = [];
  const useQueue = deps.queuePort != null;
  let enqueued = 0;
  let queueStaggerIndex = 0;

  for (const rec of recipients) {
    let openUrl: string | null = null;
    if (rec.resource === 'telegram') {
      const chatId = Number(rec.externalId);
      if (!Number.isFinite(chatId) || chatId <= 0) continue;
      const entry = buildWebappEntryUrl(
        { chatId, integratorUserId: rec.userId },
        baseUrl,
      );
      if (!entry) continue;
      openUrl = `${entry}&next=${encodeURIComponent('/app/patient?from=morning_ping')}`;
    } else if (rec.resource === 'max') {
      const entry = buildWebappEntryUrlForMax(
        { maxId: rec.externalId, integratorUserId: rec.userId },
        baseUrl,
      );
      if (!entry) continue;
      openUrl = `${entry}&next=${encodeURIComponent('/app/patient?from=morning_ping')}`;
    }
    if (!openUrl) continue;

    const channel = rec.resource === 'max' ? 'max' : 'telegram';
    const idemKey = `morning_warmup_ping:${dateKey}:${rec.userId}:${channel}`;
    const acquired = await tryAcquireMorningPingKey(db, idemKey);
    if (!acquired) continue;
    const chatId = Number(rec.externalId);
    if (!Number.isFinite(chatId) || chatId <= 0) continue;

    const inlineKeyboard = [[{ text: 'Открыть', web_app: { url: openUrl } }]];

    if (useQueue) {
      const staggerSec = Math.min(queueStaggerIndex, 120);
      queueStaggerIndex += 1;
      await deps.queuePort!.enqueue({
        kind: 'message.deliver',
        payload: {
          intent: {
            type: 'message.send',
            meta: {
              eventId: `${ctx.event.meta.eventId}:morningPing:${rec.userId}:${channel}`,
              occurredAt,
              source: channel,
              userId: rec.userId,
            },
            payload: {
              recipient: { chatId },
              message: { text: PING_TEXT },
              replyMarkup: { inline_keyboard: inlineKeyboard },
              delivery: { channels: [channel], maxAttempts: 1 },
            },
          },
          targets: [{ resource: channel, address: { chatId } }],
          retry: { maxAttempts: 1, backoffSeconds: [staggerSec] },
        },
      });
      enqueued += 1;
    } else {
      intents.push({
        type: 'message.send',
        meta: {
          eventId: `${ctx.event.meta.eventId}:morningPing:${rec.userId}:${channel}`,
          occurredAt,
          source: channel,
          userId: rec.userId,
        },
        payload: {
          recipient: { chatId },
          message: { text: PING_TEXT },
          replyMarkup: {
            inline_keyboard: inlineKeyboard,
          },
          delivery: { channels: [channel], maxAttempts: 1 },
        },
      });
    }
  }

  return {
    actionId: action.id,
    status: 'success',
    ...(intents.length > 0 ? { intents } : {}),
    values: {
      deliveryMode: useQueue ? 'queued' : 'intents',
      ...(useQueue ? { enqueued } : { intentCount: intents.length }),
    },
  };
}
