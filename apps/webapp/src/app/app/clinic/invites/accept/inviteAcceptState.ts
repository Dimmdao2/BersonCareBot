export type InviteAcceptPhase = 'lookup' | 'start' | 'confirm';

export type InviteAcceptErrorCode =
  | 'invalid_token'
  | 'expired_token'
  | 'reused_token'
  | 'revoked_token'
  | 'replayed_token'
  | 'invalid_body'
  | 'email_mismatch'
  | 'invalid_code'
  | 'expired_code'
  | 'too_many_attempts'
  | 'rate_limited'
  | 'email_send_failed'
  | 'email_conflict'
  | 'server_error'
  | 'network_error';

export type InviteAcceptIssue = {
  title: string;
  message: string;
  terminal: boolean;
  retryAfterSeconds?: number;
};

const tokenIssues: Record<'invalid_token' | 'expired_token' | 'reused_token', InviteAcceptIssue> = {
  invalid_token: {
    title: 'Приглашение недоступно',
    message: 'Ссылка на приглашение недействительна. Попросите отправить новое приглашение.',
    terminal: true,
  },
  expired_token: {
    title: 'Срок приглашения истёк',
    message: 'Срок действия этой ссылки истёк. Попросите отправить новое приглашение.',
    terminal: true,
  },
  reused_token: {
    title: 'Приглашение больше не действует',
    message:
      'Эта ссылка уже использована, отозвана или заменена новой. Попросите актуальное приглашение.',
    terminal: true,
  },
};

export function inviteAcceptIssue(
  code: string | undefined,
  phase: InviteAcceptPhase,
  retryAfterSeconds?: number,
): InviteAcceptIssue {
  if (code === 'invalid_token' || code === 'expired_token' || code === 'reused_token') {
    return tokenIssues[code];
  }
  if (code === 'revoked_token' || code === 'replayed_token') {
    return tokenIssues.reused_token;
  }

  switch (code) {
    case 'invalid_body':
      return {
        title: 'Не удалось обработать приглашение',
        message:
          'Обновите страницу и повторите попытку. Если ошибка останется, попросите новое приглашение.',
        terminal: false,
      };
    case 'email_mismatch':
      return {
        title: 'Приглашение предназначено для другого email',
        message:
          'Эта ссылка работает только с email, указанным в приглашении. Попросите отправителя проверить адрес.',
        terminal: true,
      };
    case 'invalid_code':
      return {
        title: 'Код не подошёл',
        message: 'Проверьте код из письма и попробуйте ещё раз.',
        terminal: false,
      };
    case 'expired_code':
      return {
        title: 'Срок кода истёк',
        message: 'Запросите новый код и введите его из последнего письма.',
        terminal: false,
      };
    case 'too_many_attempts':
      return {
        title: 'Слишком много попыток',
        message: 'Этот код больше нельзя проверять. Вернитесь и запросите новый код позже.',
        terminal: false,
      };
    case 'rate_limited':
      return {
        title: 'Подождите перед повторной отправкой',
        message: 'Код был отправлен недавно. Повторите попытку после окончания таймера.',
        terminal: false,
        retryAfterSeconds,
      };
    case 'email_send_failed':
      return {
        title: 'Не удалось отправить код',
        message: 'Код не был отправлен. Проверьте соединение и запросите его повторно.',
        terminal: false,
      };
    case 'email_conflict':
      return {
        title: 'Не удалось подтвердить этот email',
        message:
          'Этот email нельзя связать с приглашением автоматически. Войдите в нужный аккаунт или обратитесь в поддержку.',
        terminal: true,
      };
    case 'network_error':
      return {
        title:
          phase === 'lookup'
            ? 'Не удалось проверить приглашение'
            : 'Не удалось связаться с сервером',
        message: 'Проверьте подключение к интернету и повторите попытку.',
        terminal: false,
      };
    case 'server_error':
    default:
      return {
        title: 'Сервис временно недоступен',
        message: 'На стороне сервиса произошла ошибка. Повторите попытку позже.',
        terminal: false,
      };
  }
}

export function inviteAcceptIssueFromResponse(
  response: Response,
  payload: Record<string, unknown>,
  phase: InviteAcceptPhase,
): InviteAcceptIssue {
  const code =
    typeof payload.error === 'string'
      ? payload.error
      : response.status >= 500
        ? 'server_error'
        : undefined;
  const retryAfterSeconds =
    typeof payload.retryAfterSeconds === 'number' ? payload.retryAfterSeconds : undefined;
  return inviteAcceptIssue(code, phase, retryAfterSeconds);
}
