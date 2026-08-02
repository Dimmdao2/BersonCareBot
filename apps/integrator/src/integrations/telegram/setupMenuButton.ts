/**
 * Настраивает кнопку меню (сбоку от поля ввода) и список команд.
 * У пользователей — стандартная кнопка меню (без Web App). У админа — меню команд.
 */
import { logger } from '../../infra/observability/logger.js';
import { getBotInstance } from './client.js';

export async function setupTelegramMenuButton(): Promise<void> {
  const api = (await getBotInstance()).api;

  try {
    await api.deleteMyCommands();
    await api.deleteMyCommands({ scope: { type: 'all_private_chats' } });
    await api.setMyCommands([]);
    logger.info('Telegram: commands cleared for default and all_private_chats');

    await api.setChatMenuButton({ menu_button: { type: 'default' } });
    logger.info('Telegram: setChatMenuButton (default) ok');

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
