type SecurityAction =
  | 'start_enrollment'
  | 'verify_enrollment'
  | 'confirm_recovery'
  | 'bind_specialist'
  | 'retry_provisioning'
  | 'revoke_sessions'
  | 'change_password'
  | 'login_factor'
  | 'email_password_login';

const actionFallback: Record<SecurityAction, string> = {
  start_enrollment: 'Не удалось начать настройку защиты. Повторите попытку.',
  verify_enrollment: 'Не удалось проверить код. Получите новый код и повторите.',
  confirm_recovery:
    'Не удалось подтвердить сохранение кодов. Проверьте, что коды сохранены, и повторите.',
  bind_specialist: 'Не удалось подключить рабочий кабинет. Повторите попытку позже.',
  retry_provisioning: 'Не удалось завершить настройку аккаунта. Повторите попытку позже.',
  revoke_sessions: 'Не удалось завершить другие сеансы. Повторите попытку.',
  change_password: 'Пароль не изменён. Проверьте данные и повторите попытку.',
  login_factor: 'Не удалось подтвердить вход. Введите код ещё раз.',
  email_password_login: 'Не удалось войти из-за сбоя на нашей стороне. Повторите попытку позже.',
};

/** Human-readable staff-security errors for browser surfaces. */
export function staffSecurityErrorText(error: string | undefined, action: SecurityAction): string {
  switch (error) {
    case 'wrong_current_password':
      return 'Текущий пароль указан неверно. Проверьте его и повторите попытку.';
    case 'password_temporarily_locked':
      return 'Слишком много неверных попыток. Подождите 15 минут или восстановите пароль.';
    case 'weak_new_password':
      return 'Новый пароль должен содержать от 8 до 128 символов. Измените пароль и повторите.';
    case 'password_login_unavailable':
      return 'Для аккаунта не настроен вход по паролю. Используйте другой способ входа.';
    case 'password_not_available_for_role':
      return 'Вход по паролю не доступен. Выполните вход по коду или выберите другой способ';
    case 'password_changed_session_reissue_failed':
      return 'Пароль изменён, но сеанс завершён. Войдите снова с новым паролем.';
    case 'rate_limited':
      return 'Слишком много попыток. Подождите 10 минут и повторите.';
    case 'factor_locked':
      return 'Слишком много неверных кодов. Подождите 15 минут и попробуйте снова.';
    case 'invalid_factor':
      return 'Код неверный. Проверьте код в приложении и введите новый.';
    case 'invalid_recovery_code':
      return 'Резервный код неверный или уже использован. Введите другой резервный код.';
    case 'invalid_credentials':
      return 'Не удалось подтвердить вход. Войдите снова и запросите новый код.';
    case 'invalid_body':
      return 'Данные введены неверно. Проверьте их и повторите действие.';
    case 'enrollment_not_started':
      return 'Настройка защиты не начата. Начните подключение приложения заново.';
    case 'security_session_required':
    case 'verified_security_required':
      return 'Сеанс защиты больше не подтверждён. Выйдите и войдите снова, затем повторите.';
    case 'verified_email_required':
      return 'Email не подтверждён. Подтвердите email и повторите настройку защиты.';
    case 'factor_already_enrolled':
      return 'Приложение-аутентификатор уже подключено. Обновите страницу.';
    case 'totp_enrollment_start_failed':
      return 'Не удалось создать ключ защиты. Повторите попытку позже.';
    case 'owner_required':
      return 'Подключить рабочий кабинет может только владелец. Войдите под аккаунтом владельца.';
    case 'specialist_binding_failed':
      return 'Рабочий кабинет не подключён. Повторите попытку позже.';
    case 'auth_channel_disabled':
      return 'Вход по email временно отключён. Обратитесь к администратору и повторите позже.';
    case 'signup_intent_not_found':
      return 'Заявка на создание кабинета не найдена. Начните регистрацию кабинета заново.';
    case 'provisioning_pending':
      return 'Настройка аккаунта ещё выполняется. Подождите немного и повторите.';
    case 'doctor_workspace_membership_required':
      return 'Рабочий кабинет не найден. Завершите настройку кабинета и повторите действие.';
    case 'security_setup_required':
      return 'Сначала подключите двухфакторную защиту в разделе «Аккаунт» → «Безопасность».';
    case 'login_challenge_expired':
      return 'Время подтверждения истекло. Войдите снова и запросите новый код.';
    case 'factor_replacement_required':
      return 'Нужно заменить фактор защиты. Войдите с резервным кодом и подключите приложение заново.';
    case 'unauthorized':
      return 'Сеанс входа истёк. Войдите снова и повторите действие.';
    case 'forbidden':
      return 'Для этого действия нет доступа. Войдите под нужным аккаунтом и повторите.';
    case 'proxy_configuration':
      return 'Защита входа временно недоступна. Обратитесь к администратору и повторите позже.';
    case 'password_change_failed':
      return 'Пароль не изменён из-за временной ошибки. Повторите попытку позже.';
    case 'security_setup_pending':
      return 'Не удалось подготовить защищённый вход. Повторите попытку позже.';
    default:
      return actionFallback[action];
  }
}

export function staffSecurityNetworkErrorText(action: SecurityAction): string {
  return `${actionFallback[action]} Проверьте соединение с интернетом.`;
}
