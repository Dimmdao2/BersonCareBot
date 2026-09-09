/**
 * Telegram LONG-POLLING runner.
 *
 * For hosts that Telegram cannot reach INBOUND (RU-isolated prod behind the
 * AmneziaWG split-tunnel: only OUTBOUND to Telegram works). Instead of a webhook
 * we pull updates with getUpdates and feed each through the SAME pipeline the
 * webhook uses (`processTelegramUpdate`).
 *
 * Safety:
 * - Never calls setWebhook. Calls deleteWebhook only for the deployment cutover switch.
 * - Fully NON-FATAL: any Telegram / getUpdates error logs + backs off; the API
 *   process stays up (webapp / M2M unaffected). A 409 (a webhook is still set for
 *   this token) is surfaced clearly and retried — it never crashes the process.
 */
import { getBotInstance } from './client.js';
import { env } from '../../config/env.js';
import { parseWebhookBody } from './schema.js';
import { processTelegramUpdate, type TelegramWebhookDeps } from './webhook.js';
import { setupTelegramMenuButton } from './setupMenuButton.js';
import type { PlatformDeliveryAudience } from '../../infra/adapters/platformDeliveryAudience.js';
import {
  getRequestLogger,
  logger,
  newCorrelationId,
  newEventId,
  runWithCorrelationContext,
} from '../../infra/observability/logger.js';

const GET_UPDATES_TIMEOUT_SEC = 30;
const ERROR_BACKOFF_MS = 5_000;

const loops = new Map<
  PlatformDeliveryAudience,
  { controller: AbortController; promise: Promise<void> }
>();

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });

    function done(): void {
      clearTimeout(timeout);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });
}

/**
 * Starts the long-polling loop in the background (fire-and-forget). Idempotent.
 * Returns immediately and never throws — the loop owns its error handling so a
 * Telegram outage cannot crash startup.
 */
export function startTelegramLongPolling(
  deps: TelegramWebhookDeps,
  audience: PlatformDeliveryAudience = 'patient',
): void {
  if (loops.has(audience)) return;
  const controller = new AbortController();
  const promise = runLoop(deps, audience, controller.signal)
    .catch((err) => {
      logger.error({ err }, 'Telegram long-polling: runner crashed unexpectedly (non-fatal guard)');
    })
    .finally(() => {
      if (loops.get(audience)?.controller === controller) loops.delete(audience);
    });
  loops.set(audience, { controller, promise });
}

export async function stopTelegramLongPolling(
  audience: PlatformDeliveryAudience = 'patient',
): Promise<void> {
  const active = loops.get(audience);
  if (!active) return;
  active.controller.abort();
  await active.promise;
}

async function runLoop(
  deps: TelegramWebhookDeps,
  audience: PlatformDeliveryAudience,
  signal: AbortSignal,
): Promise<void> {
  logger.info('Telegram: starting long-polling runner (getUpdates)');

  // Menu button / commands — best-effort, non-blocking (already non-fatal internally).
  void setupTelegramMenuButton(audience);

  let bot;
  try {
    bot = await getBotInstance(audience);
  } catch (err) {
    logger.warn(
      { err },
      'Telegram long-polling: runtime configuration unavailable; runner stopped',
    );
    return;
  }

  if (env.TELEGRAM_DELETE_WEBHOOK_ON_START) {
    try {
      await bot.api.deleteWebhook();
      logger.info('Telegram long-polling: deleteWebhook ok (this host owns the bot)');
    } catch (err) {
      logger.warn({ err }, 'Telegram long-polling: deleteWebhook failed (non-fatal)');
    }
  }

  let offset: number | undefined;
  while (!signal.aborted) {
    let updates: Awaited<ReturnType<typeof bot.api.getUpdates>>;
    try {
      updates = await bot.api.getUpdates(
        {
          ...(offset !== undefined ? { offset } : {}),
          timeout: GET_UPDATES_TIMEOUT_SEC,
          allowed_updates: ['message', 'callback_query'],
        },
        signal as Parameters<typeof bot.api.getUpdates>[1],
      );
    } catch (err) {
      if (signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      const isConflict = msg.includes('409') || /conflict/i.test(msg);
      logger.warn(
        { errorName: err instanceof Error ? err.name : typeof err, reason: msg },
        isConflict
          ? 'Telegram long-polling: getUpdates 409 — a webhook is still set for this bot; cannot poll until it is removed (set TELEGRAM_DELETE_WEBHOOK_ON_START=1 ONLY when this host owns the bot). Retrying after backoff.'
          : 'Telegram long-polling: getUpdates failed; retrying after backoff',
      );
      await sleep(ERROR_BACKOFF_MS, signal);
      continue;
    }

    for (const update of updates) {
      if (signal.aborted) return;
      const correlationId = newCorrelationId();
      const eventId = newEventId('incoming');
      const reqLogger = getRequestLogger(correlationId, { correlationId, eventId });
      try {
        await runWithCorrelationContext(correlationId, async () => {
          const parsed = parseWebhookBody(update);
          if (!parsed.success) {
            reqLogger.warn(
              { updateId: update.update_id },
              'Telegram long-polling: update failed body validation (skipped)',
            );
            return;
          }
          await processTelegramUpdate(parsed.data, deps, {
            correlationId,
            eventId,
            logger: reqLogger,
            platformAudience: audience,
          });
        });
        offset = update.update_id + 1;
      } catch (err) {
        reqLogger.error({ err }, 'Telegram long-polling: update processing failed; retrying');
        await sleep(ERROR_BACKOFF_MS, signal);
        break;
      }
    }
  }
}
