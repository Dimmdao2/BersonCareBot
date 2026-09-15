import { describe, it, expect } from 'vitest';
import { normalizeTelegramLoginBotUsername } from './telegramLoginBotUsernameInput';

/**
 * Поле имени бота принимает ту запись, в которой человек это имя видит. Владелец 16.09.2026 набрал
 * его по подписи «Имя бота (без @)» и получил в проде чужого бота: запись оказалась не той, а
 * сверить её было не с чем. Тест держит именно ПОВЕДЕНИЕ двери — что принимается и во что
 * превращается, — а не текст реализации.
 */
describe('имя телеграм-бота из настроек', () => {
  it('принимает три записи одного имени и приводит их к одной', () => {
    for (const input of [
      'berson_bot',
      '@berson_bot',
      ' @berson_bot ',
      't.me/berson_bot',
      'https://t.me/berson_bot',
      'http://www.telegram.me/berson_bot/',
      'https://t.me/berson_bot?start=login',
    ]) {
      expect(normalizeTelegramLoginBotUsername(input), input).toEqual({
        ok: true,
        value: 'berson_bot',
      });
    }
  });

  it('пустое значение — это снятие имени, а не ошибка', () => {
    expect(normalizeTelegramLoginBotUsername('')).toEqual({ ok: true, value: '' });
    expect(normalizeTelegramLoginBotUsername('   ')).toEqual({ ok: true, value: '' });
  });

  it('отказывает тому, что телеграм именем не считает', () => {
    for (const input of [
      '780713840637', // числовой id бота — частая подстановка вместо username
      'bot', // короче пяти символов
      '_berson_bot', // первый символ не буква
      'berson bot',
      'berson-bot',
      'https://max.ru/id780713840637_1_bot', // ссылка другого мессенджера
      42,
      null,
    ]) {
      expect(normalizeTelegramLoginBotUsername(input), String(input)).toEqual({
        ok: false,
        error: 'invalid_username',
      });
    }
  });
});
