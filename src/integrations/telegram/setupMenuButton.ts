/**
 * Настраивает кнопку меню (сбоку от поля ввода) и список команд.
 * По умолчанию — кнопка «Открыть приложение» (Web App), чтобы открытие шло как Mini App с initData.
 * У админа — меню команд (start, admin_bookings и т.д.).
 */
import { logger } from '../../infra/observability/logger.js';
import { env } from '../../config/env.js';
import { telegramConfig } from './config.js';
import { getBotInstance } from './client.js';

const WEBAPP_MENU_TEXT = 'Открыть приложение';

export async function setupTelegramMenuButton(): Promise<void> {
  const adminChatId = telegramConfig.adminTelegramId;
  const api = getBotInstance().api;
  const webappUrl = env.APP_BASE_URL?.replace(/\/$/, '') + '/app';

  try {
    await api.deleteMyCommands();
    await api.deleteMyCommands({ scope: { type: 'all_private_chats' } });
    await api.setMyCommands([]);
    logger.info('Telegram: commands cleared for default and all_private_chats');

    if (webappUrl && webappUrl.startsWith('http')) {
      await api.setChatMenuButton({
        menu_button: {
          type: 'web_app',
          text: WEBAPP_MENU_TEXT,
          web_app: { url: webappUrl },
        },
      });
      logger.info({ webappUrl }, 'Telegram: setChatMenuButton (web_app) ok');
    } else {
      await api.setChatMenuButton({ menu_button: { type: 'default' } });
      logger.info('Telegram: setChatMenuButton (default) ok, APP_BASE_URL not set');
    }

    await api.setMyCommands(
      [
        { command: 'start', description: 'Главное меню' },
        { command: 'show_my_id', description: 'Показать ID пользователя' },
        { command: 'admin_bookings', description: '📅 Активные записи' },
        { command: 'admin_users', description: '👥 Пользователи' },
        { command: 'unanswered', description: '❓ Неотвеченные вопросы' },
      ],
      { scope: { type: 'chat', chat_id: adminChatId } },
    );
    logger.info({ adminChatId }, 'Telegram: setMyCommands (admin) ok');

    await api.setChatMenuButton({
      chat_id: adminChatId,
      menu_button: { type: 'commands' },
    });
    logger.info({ adminChatId }, 'Telegram: setChatMenuButton (admin) ok');
  } catch (err) {
    logger.warn({ err }, 'Telegram: setup menu button failed (non-fatal)');
  }
}

/**
 * Больше не скрываем кнопку меню у пользователей: у всех по умолчанию «Открыть приложение» (Web App).
 * Оставлено для совместимости вызовов из webhook.
 */
export async function ensureNoMenuButtonForUser(_chatId: number): Promise<void> {
  // no-op: default menu is web_app, so everyone can open the app as Mini App
}
