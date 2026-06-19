/**
 * Telegram LONG-POLLING runner.
 *
 * For hosts that Telegram cannot reach INBOUND (RU-isolated prod behind the
 * AmneziaWG split-tunnel: only OUTBOUND to Telegram works). Instead of a webhook
 * we pull updates with getUpdates and feed each through the SAME pipeline the
 * webhook uses (`processTelegramUpdate`).
 *
 * Safety:
 * - Never calls setWebhook. Calls deleteWebhook ONLY when
 *   `telegramConfig.deleteWebhookOnStart` is true (host owns the bot at cutover).
 * - Fully NON-FATAL: any Telegram / getUpdates error logs + backs off; the API
 *   process stays up (webapp / M2M unaffected). A 409 (a webhook is still set for
 *   this token) is surfaced clearly and retried — it never crashes the process.
 */
import { getBotInstance } from './client.js';
import { telegramConfig } from './config.js';
import { parseWebhookBody } from './schema.js';
import { processTelegramUpdate, type TelegramWebhookDeps } from './webhook.js';
import { setupTelegramMenuButton } from './setupMenuButton.js';
import { getRequestLogger, newEventId, logger } from '../../infra/observability/logger.js';

const GET_UPDATES_TIMEOUT_SEC = 30;
const ERROR_BACKOFF_MS = 5_000;

let running = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Starts the long-polling loop in the background (fire-and-forget). Idempotent.
 * Returns immediately and never throws — the loop owns its error handling so a
 * Telegram outage cannot crash startup.
 */
export function startTelegramLongPolling(deps: TelegramWebhookDeps): void {
  if (running) return;
  running = true;
  void runLoop(deps);
}

async function runLoop(deps: TelegramWebhookDeps): Promise<void> {
  logger.info('Telegram: starting long-polling runner (getUpdates)');

  // Menu button / commands — best-effort, non-blocking (already non-fatal internally).
  void setupTelegramMenuButton();

  const bot = getBotInstance();

  if (telegramConfig.deleteWebhookOnStart) {
    try {
      await bot.api.deleteWebhook();
      logger.info('Telegram long-polling: deleteWebhook ok (this host owns the bot)');
    } catch (err) {
      logger.warn({ err }, 'Telegram long-polling: deleteWebhook failed (non-fatal)');
    }
  }

  let offset: number | undefined;
  for (;;) {
    let updates: Awaited<ReturnType<typeof bot.api.getUpdates>>;
    try {
      updates = await bot.api.getUpdates({
        ...(offset !== undefined ? { offset } : {}),
        timeout: GET_UPDATES_TIMEOUT_SEC,
        allowed_updates: ['message', 'callback_query'],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isConflict = msg.includes('409') || /conflict/i.test(msg);
      logger.warn(
        { err: msg },
        isConflict
          ? 'Telegram long-polling: getUpdates 409 — a webhook is still set for this bot; cannot poll until it is removed (set TELEGRAM_DELETE_WEBHOOK_ON_START=1 ONLY when this host owns the bot). Retrying after backoff.'
          : 'Telegram long-polling: getUpdates failed; retrying after backoff',
      );
      await sleep(ERROR_BACKOFF_MS);
      continue;
    }

    for (const update of updates) {
      offset = update.update_id + 1;
      const correlationId = `lp-${update.update_id}`;
      const eventId = newEventId('incoming');
      const reqLogger = getRequestLogger(correlationId, { correlationId, eventId });
      try {
        const parsed = parseWebhookBody(update);
        if (!parsed.success) {
          reqLogger.warn(
            { updateId: update.update_id },
            'Telegram long-polling: update failed body validation (skipped)',
          );
          continue;
        }
        await processTelegramUpdate(parsed.data, deps, { correlationId, eventId, logger: reqLogger });
      } catch (err) {
        reqLogger.error({ err }, 'Telegram long-polling: update processing failed (skipped)');
      }
    }
  }
}
