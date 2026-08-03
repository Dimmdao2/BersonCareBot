import { describe, expect, it } from 'vitest';
import { staffSecurityErrorText } from './staffSecurityErrorText';

/**
 * AUTH_ERROR_MESSAGES_BRIEF_2026-08-03.md: an unrecognized/empty response from the login route must
 * read as a failure on our side, never as a credentials problem — the bare `toast.error('Не удалось
 * войти.')` fallback it replaces gave no such signal.
 */
describe('staffSecurityErrorText — email_password_login fallback', () => {
  it('names an our-side failure, not a credentials one, for an unrecognized or missing code', () => {
    const unrecognized = staffSecurityErrorText('some_future_code', 'email_password_login');
    const missing = staffSecurityErrorText(undefined, 'email_password_login');

    expect(unrecognized).toBe(missing);
    expect(unrecognized).toContain('сбоя на нашей стороне');
    expect(unrecognized).not.toMatch(/парол|email|логин/i);
  });

  it('keeps the established rate-limit and proxy-configuration wording available to this action', () => {
    expect(staffSecurityErrorText('rate_limited', 'email_password_login')).toBe(
      'Слишком много попыток. Подождите 10 минут и повторите.',
    );
    expect(staffSecurityErrorText('proxy_configuration', 'email_password_login')).toBe(
      'Защита входа временно недоступна. Обратитесь к администратору и повторите позже.',
    );
  });

  it('covers security_setup_pending with actionable text instead of falling back', () => {
    expect(staffSecurityErrorText('security_setup_pending', 'email_password_login')).toBe(
      'Не удалось подготовить защищённый вход. Повторите попытку позже.',
    );
  });
});
