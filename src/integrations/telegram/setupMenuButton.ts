/**
 * Настраивает для админа кнопку меню (квадратная кнопка рядом с полем ввода) и список команд.
 * Только для чата админа — без ReplyKeyboard, только меню-кнопка со списком команд.
 */
import { logger } from '../../infra/observability/logger.js';
import { telegramConfig } from './config.js';
import { getBotInstance } from './client.js';

export async function setupTelegramMenuButton(): Promise<void> {
  const adminChatId = telegramConfig.adminTelegramId;

  const api = getBotInstance().api;

  try {
    await api.setMyCommands([
      { command: 'start', description: 'Главное меню' },
      { command: 'show_my_id', description: 'Показать ID пользователя' },
    ]);
    logger.info('Telegram: setMyCommands (default) ok');

    // Команды только для админа: пункты меню = команды (без inline-кнопок)
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
