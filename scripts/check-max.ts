/**
 * Проверка конфигурации и доступности MAX бота (по аналогии с проверкой Telegram).
 * Вызывает GET /me API MAX; выводит имя бота и user_id при успехе.
 * Run: npx tsx scripts/check-max.ts
 * Requires: .env с MAX_ENABLED=true, MAX_API_KEY=...
 */
import '../src/config/loadEnv.js';
import { getMaxBotInfo } from '../src/integrations/max/client.js';
import { maxConfig } from '../src/integrations/max/config.js';

async function main() {
  if (!maxConfig.enabled) {
    console.log('MAX_ENABLED is not true. Set MAX_ENABLED=true and MAX_API_KEY in .env to check MAX bot.');
    process.exit(0);
  }
  if (!maxConfig.apiKey) {
    console.error('MAX_ENABLED=true but MAX_API_KEY is empty. Set MAX_API_KEY in .env.');
    process.exit(1);
  }

  const info = await getMaxBotInfo({
    apiKey: maxConfig.apiKey,
    baseUrl: process.env.MAX_API_BASE_URL ?? undefined,
  });

  if (!info) {
    console.error('MAX API /me failed: invalid API key or network error. Check MAX_API_KEY and MAX docs (https://dev.max.ru/docs-api).');
    process.exit(1);
  }

  console.log('MAX bot OK:');
  console.log('  user_id:', info.user_id);
  console.log('  name:', info.name);
  if (info.username) console.log('  username:', info.username);
  console.log('  is_bot:', info.is_bot);
  if (maxConfig.webhookSecret) {
    console.log('  webhook secret: set');
  } else {
    console.log('  webhook secret: not set (webhook will accept any request)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
