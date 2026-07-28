import { describe, expect, it } from 'vitest';
import { staffSecurityErrorText } from './staffSecurityErrorText';

describe('staffSecurityErrorText', () => {
  it.each([
    [
      'security_session_required',
      'Сеанс защиты больше не подтверждён. Выйдите и войдите снова, затем повторите.',
    ],
    [
      'verified_email_required',
      'Email не подтверждён. Подтвердите email и повторите настройку защиты.',
    ],
    ['factor_already_enrolled', 'Приложение-аутентификатор уже подключено. Обновите страницу.'],
    ['totp_enrollment_start_failed', 'Не удалось создать ключ защиты. Повторите попытку позже.'],
    [
      'enrollment_not_started',
      'Настройка защиты не начата. Начните подключение приложения заново.',
    ],
    ['invalid_factor', 'Код неверный. Проверьте код в приложении и введите новый.'],
    ['factor_locked', 'Слишком много неверных кодов. Подождите 15 минут и попробуйте снова.'],
    [
      'owner_required',
      'Подключить рабочий кабинет может только владелец. Войдите под аккаунтом владельца.',
    ],
    ['specialist_binding_failed', 'Рабочий кабинет не подключён. Повторите попытку позже.'],
    [
      'auth_channel_disabled',
      'Вход по email временно отключён. Обратитесь к администратору и повторите позже.',
    ],
    [
      'signup_intent_not_found',
      'Заявка на создание кабинета не найдена. Начните регистрацию кабинета заново.',
    ],
    ['provisioning_pending', 'Настройка аккаунта ещё выполняется. Подождите немного и повторите.'],
    [
      'doctor_workspace_membership_required',
      'Рабочий кабинет не найден. Завершите настройку кабинета и повторите действие.',
    ],
    [
      'security_setup_required',
      'Сначала подключите двухфакторную защиту в разделе «Аккаунт» → «Безопасность».',
    ],
    ['wrong_current_password', 'Текущий пароль указан неверно. Проверьте его и повторите попытку.'],
    [
      'password_temporarily_locked',
      'Слишком много неверных попыток. Подождите 15 минут или восстановите пароль.',
    ],
    [
      'weak_new_password',
      'Новый пароль должен содержать от 8 до 128 символов. Измените пароль и повторите.',
    ],
    [
      'password_login_unavailable',
      'Для аккаунта не настроен вход по паролю. Используйте другой способ входа.',
    ],
    [
      'password_change_failed',
      'Пароль не изменён из-за временной ошибки. Повторите попытку позже.',
    ],
    [
      'password_changed_session_reissue_failed',
      'Пароль изменён, но сеанс завершён. Войдите снова с новым паролем.',
    ],
    [
      'invalid_recovery_code',
      'Резервный код неверный или уже использован. Введите другой резервный код.',
    ],
    [
      'login_challenge_expired',
      'Время подтверждения истекло. Войдите снова и запросите новый код.',
    ],
    [
      'factor_replacement_required',
      'Нужно заменить фактор защиты. Войдите с резервным кодом и подключите приложение заново.',
    ],
    [
      'proxy_configuration',
      'Защита входа временно недоступна. Обратитесь к администратору и повторите позже.',
    ],
    ['invalid_body', 'Данные введены неверно. Проверьте их и повторите действие.'],
    ['invalid_credentials', 'Не удалось подтвердить вход. Войдите снова и запросите новый код.'],
    ['unauthorized', 'Сеанс входа истёк. Войдите снова и повторите действие.'],
    ['forbidden', 'Для этого действия нет доступа. Войдите под нужным аккаунтом и повторите.'],
  ])('explains %s and the next step', (code, text) => {
    expect(staffSecurityErrorText(code, 'start_enrollment')).toBe(text);
  });

  it('does not collapse different server reasons into one message', () => {
    expect(staffSecurityErrorText('invalid_factor', 'verify_enrollment')).not.toBe(
      staffSecurityErrorText('factor_locked', 'verify_enrollment'),
    );
  });
});
