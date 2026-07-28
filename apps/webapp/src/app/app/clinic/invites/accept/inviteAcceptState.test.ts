import { describe, expect, it } from 'vitest';
import { inviteAcceptIssue, inviteAcceptIssueFromResponse } from './inviteAcceptState';

describe('inviteAcceptIssue', () => {
  it.each([
    ['invalid_token', 'Ссылка на приглашение недействительна', true],
    ['expired_token', 'Срок действия этой ссылки истёк', true],
    ['reused_token', 'уже использована, отозвана или заменена', true],
    ['revoked_token', 'уже использована, отозвана или заменена', true],
    ['replayed_token', 'уже использована, отозвана или заменена', true],
    ['invalid_body', 'Обновите страницу', false],
    ['email_mismatch', 'работает только с email', true],
    ['invalid_code', 'Проверьте код', false],
    ['expired_code', 'Запросите новый код', false],
    ['too_many_attempts', 'больше нельзя проверять', false],
    ['rate_limited', 'был отправлен недавно', false],
    ['email_send_failed', 'Код не был отправлен', false],
    ['email_conflict', 'нельзя связать', true],
    ['server_error', 'стороне сервиса произошла ошибка', false],
    ['network_error', 'Проверьте подключение', false],
  ] as const)('maps %s precisely', (code, message, terminal) => {
    const issue = inviteAcceptIssue(code, 'confirm', 17);

    expect(issue.message).toContain(message);
    expect(issue.terminal).toBe(terminal);
  });

  it('keeps a rate-limit retry duration and maps untyped 5xx responses to a retryable server error', () => {
    expect(inviteAcceptIssue('rate_limited', 'start', 23).retryAfterSeconds).toBe(23);
    const issue = inviteAcceptIssueFromResponse(new Response(null, { status: 503 }), {}, 'start');
    expect(issue).toMatchObject({ title: 'Сервис временно недоступен', terminal: false });
  });
});
