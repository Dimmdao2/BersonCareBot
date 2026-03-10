/**
 * Закрывает диалоги, в которых последнее сообщение было более 24 часов назад.
 * Запуск: cron раз в день или вручную.
 * Домен не трогаем — только инфра: read repo + write repo.
 */
import '../../config/loadEnv.js';
import { createDbPort } from '../db/client.js';
import { listOpenConversationsOlderThan, setConversationState } from '../db/repos/messageThreads.js';
import { logger } from '../observability/logger.js';

const STALE_HOURS = 24;
const LIMIT = 100;

async function main(): Promise<void> {
  const db = createDbPort();
  const olderThan = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();

  const rows = await listOpenConversationsOlderThan(db, {
    olderThanIso: olderThan,
    limit: LIMIT,
  });

  if (rows.length === 0) {
    logger.info({ olderThan }, 'auto-close: no stale conversations');
    return;
  }

  logger.info({ count: rows.length, olderThan }, 'auto-close: closing stale conversations');

  for (const row of rows) {
    await setConversationState(db, {
      id: row.id,
      status: 'closed',
      closedAt: new Date().toISOString(),
      closeReason: 'auto_24h',
    });
    logger.info({ conversationId: row.id, lastMessageAt: row.last_message_at }, 'auto-close: closed');
  }
}

main().catch((err) => {
  logger.error({ err }, 'auto-close-stale-conversations failed');
  process.exit(1);
});
