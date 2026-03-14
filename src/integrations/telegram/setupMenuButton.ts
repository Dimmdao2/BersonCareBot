/**
 * Настраивает кнопку меню (сбоку от поля ввода) и список команд.
 * У клиентов меню скрыто (команда /show_my_id остаётся работающей, но не показывается в меню).
 * У админа — меню со списком команд.
 */
import { logger } from '../../infra/observability/logger.js';
import { telegramConfig } from './config.js';
import { getBotInstance } from './client.js';

export async function setupTelegramMenuButton(): Promise<void> {
  const adminChatId = telegramConfig.adminTelegramId;

  const api = getBotInstance().api;

  try {
    // У клиентов кнопка меню сбоку от поля ввода не показывается: пустой список команд + default кнопка
    // /start и /show_my_id по-прежнему работают (обрабатываются ботом), просто не отображаются в меню
    await api.setMyCommands([]);
    logger.info('Telegram: setMyCommands (default: empty, no menu) ok');

    await api.setChatMenuButton({ menu_button: { type: 'default' } });
    logger.info('Telegram: setChatMenuButton (default) ok');

    // Команды только для админа: пункты меню = команды
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

    // Кнопка меню со списком команд только у админа
    await api.setChatMenuButton({
      chat_id: adminChatId,
      menu_button: { type: 'commands' },
    });
    logger.info({ adminChatId }, 'Telegram: setChatMenuButton (admin) ok');
  } catch (err) {
    logger.warn({ err }, 'Telegram: setup admin menu button failed (non-fatal)');
  }
}
