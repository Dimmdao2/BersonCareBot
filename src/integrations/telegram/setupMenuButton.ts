/**
 * Настраивает кнопку меню (сбоку от поля ввода) и список команд.
 * У клиентов команды не регистрируются (show_my_id — только сценарий по тексту, не команда в меню).
 * Кнопка меню у клиентов убирается при первом апдейте (см. ensureNoMenuButtonForUser в webhook).
 * У админа — меню со списком команд.
 */
import { logger } from '../../infra/observability/logger.js';
import { telegramConfig } from './config.js';
import { getBotInstance } from './client.js';

export async function setupTelegramMenuButton(): Promise<void> {
  const adminChatId = telegramConfig.adminTelegramId;

  const api = getBotInstance().api;

  try {
    // У клиентов не показываем команды в меню вообще (show_my_id — сценарий, не пункт меню)
    await api.deleteMyCommands();
    await api.deleteMyCommands({ scope: { type: 'all_private_chats' } });
    await api.setMyCommands([]);
    logger.info('Telegram: commands cleared for default and all_private_chats');

    await api.setChatMenuButton({ menu_button: { type: 'default' } });
    logger.info('Telegram: setChatMenuButton (default) ok');

    // Команды и кнопка меню только у админа
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
    logger.warn({ err }, 'Telegram: setup admin menu button failed (non-fatal)');
  }
}

/**
 * Убирает кнопку меню у пользователя в личном чате (не админ).
 * Вызывать при каждом апдейте от такого чата — Telegram применит скрытие меню.
 */
export async function ensureNoMenuButtonForUser(chatId: number): Promise<void> {
  const adminChatId = telegramConfig.adminTelegramId;
  if (typeof adminChatId === 'number' && chatId === adminChatId) return;

  getBotInstance()
    .api.setChatMenuButton({ chat_id: chatId, menu_button: { type: 'default' } })
    .catch(() => {});
}
