/**
 * Настраивает кнопку меню (сбоку от поля ввода) и список команд.
 * У пользователей — стандартная кнопка меню (без Web App). У админа — меню команд.
 */
import { logger } from '../../infra/observability/logger.js';
import { telegramConfig } from './config.js';
import { getBotInstance } from './client.js';

export async function setupTelegramMenuButton(): Promise<void> {
  const adminChatId = telegramConfig.adminTelegramId;
  const api = getBotInstance().api;

  try {
    await api.deleteMyCommands();
    await api.deleteMyCommands({ scope: { type: 'all_private_chats' } });
    await api.setMyCommands([]);
    logger.info('Telegram: commands cleared for default and all_private_chats');

    await api.setChatMenuButton({ menu_button: { type: 'default' } });
    logger.info('Telegram: setChatMenuButton (default) ok');

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
 * Оставлено для совместимости вызовов из webhook. У пользователей уже menu_button: default.
 */
export async function ensureNoMenuButtonForUser(_chatId: number): Promise<void> {
  // no-op
}
