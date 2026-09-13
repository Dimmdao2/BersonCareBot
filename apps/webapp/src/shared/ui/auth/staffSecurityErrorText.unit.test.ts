import { describe, expect, it } from 'vitest';
import { notificationText } from '@/shared/notifications/notificationText';
import { staffSecurityErrorText } from './staffSecurityErrorText';

/**
 * Здесь проверяется только свойство ответа, а не формулировки: какая статья словаря какому коду
 * отказа принадлежит, видно в самой функции, и проверка, переписывающая её фразы, ломалась бы от
 * любой редактуры текста, ничего при этом не гарантируя.
 *
 * AUTH_ERROR_MESSAGES_BRIEF_2026-08-03.md: незнакомый или пустой ответ маршрута входа обязан
 * читаться как сбой на нашей стороне — человек не должен решить, что ошибся паролем или почтой.
 */
describe('staffSecurityErrorText — email_password_login', () => {
  it('names an our-side failure, not a credentials one, for an unrecognized or missing code', () => {
    const unrecognized = staffSecurityErrorText('some_future_code', 'email_password_login');
    const missing = staffSecurityErrorText(undefined, 'email_password_login');

    expect(unrecognized).toBe(notificationText.authEmailPasswordLoginFallback);
    expect(missing).toBe(notificationText.authEmailPasswordLoginFallback);
    expect(unrecognized).not.toMatch(/парол|email|логин/iu);
  });
});
