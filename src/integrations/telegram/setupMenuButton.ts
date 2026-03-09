/**
 * Настраивает для админа кнопку меню (квадратная кнопка рядом с полем ввода) и список команд.
 * Только для чата админа — без ReplyKeyboard, только меню-кнопка со списком команд.
 */
import { env } from '../../config/env.js';
import { logger } from '../../infra/observability/logger.js';
import { getBotInstance } from './client.js';

function parseAdminChatId(): number | undefined {
  const raw = env.ADMIN_TELEGRAM_ID;
  if (typeof raw !== 'string') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export async function setupTelegramMenuButton(): Promise<void> {
  const adminChatId = parseAdminChatId();
  if (!adminChatId) return;

  const api = getBotInstance().api;

  try {
    // Команды только для админа (scope chat)
    await api.setMyCommands(
      [
        { command: 'start', description: 'Главное меню' },
        { command: 'admin', description: 'Панель администратора' },
      ],
      { scope: { type: 'chat', chat_id: adminChatId } },
    );
    logger.info({ adminChatId }, 'Telegram: setMyCommands (admin) ok');

    // Кнопка меню только для админа (chat_id — не меняем default)
    await api.setChatMenuButton({
      chat_id: adminChatId,
      menu_button: { type: 'commands' },
    });
    logger.info({ adminChatId }, 'Telegram: setChatMenuButton (admin) ok');
  } catch (err) {
    logger.warn({ err }, 'Telegram: setup admin menu button failed (non-fatal)');
  }
}
