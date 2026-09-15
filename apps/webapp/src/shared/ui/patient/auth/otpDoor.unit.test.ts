import { describe, it, expect, vi } from 'vitest';
import {
  buildPhoneMessengerOtpAlternatives,
  buildPublicPhoneOtpAlternatives,
  phoneBindOtpDescription,
  phoneLoginOtpDescription,
} from './otpDoor';
import type { AuthMethodsPayload } from '@/modules/auth/checkPhoneMethods';
import type { AuthChannelUiPolicy } from '@/modules/auth/otpChannelUi';

const allMethods = { telegram: true, max: true, email: true, sms: true } as AuthMethodsPayload;
const allChannels: AuthChannelUiPolicy = { telegram: true, max: true, email: true, sms: true };

/**
 * Дверь входа по номеру не должна ни утверждать доставку, которой могло не быть, ни предлагать
 * отправку на почту, которую человек здесь назвать не может. Оба провала владелец видел живьём
 * 15–16.09.2026: экран сказал «Код отправлен», хотя телеграм-бот не был настроен; «подтвердить по
 * email» отправило код на адрес аккаунта, найденного по возможно ошибочному номеру.
 */
describe('экран кода при входе по номеру', () => {
  it('не утверждает отправку ни на одном канале', () => {
    for (const channel of ['automatic', 'telegram', 'max', 'sms', 'email'] as const) {
      const text = phoneLoginOtpDescription(channel);
      expect(text, channel).toMatch(/^Если /);
      expect(text, channel).not.toMatch(/Код отправлен|проверьте входящие/);
    }
  });

  it('при неизвестном канале называет оба бота и молчит про сам номер', () => {
    expect(phoneLoginOtpDescription('automatic')).toBe(
      'Если этот номер у нас есть, код уже пришёл в ваш бот — Telegram или Max.',
    );
  });

  it('почта из списка «другой способ» ведёт на свою дверь, а не шлёт код', async () => {
    const resend = vi.fn();
    const emailDoor = vi.fn();
    const entries = buildPublicPhoneOtpAlternatives(allMethods, 'telegram', resend, emailDoor);
    const email = entries.find((entry) => entry.label === 'Войти по email');
    expect(email, 'почтовая запись должна быть').toBeTruthy();
    await email?.onClick();
    expect(emailDoor).toHaveBeenCalledTimes(1);
    expect(resend).not.toHaveBeenCalled();
  });

  it('боты остаются повторной отправкой по тому же номеру', async () => {
    const resend = vi.fn();
    const entries = buildPublicPhoneOtpAlternatives(allMethods, 'telegram', resend, () => {});
    await entries.find((entry) => entry.label === 'Получить код в Max')?.onClick();
    expect(resend).toHaveBeenCalledWith('max');
    expect(entries.some((entry) => entry.label === 'Получить код в Telegram')).toBe(false);
  });

  it('без почтовой двери почты в списке нет вовсе', () => {
    const entries = buildPublicPhoneOtpAlternatives(allMethods, 'telegram', vi.fn(), null);
    expect(entries.map((entry) => entry.label)).toEqual(['Получить код в Max']);
  });

  it('мессенджерный экран не предлагает почту даже при включённом канале', async () => {
    const resend = vi.fn();
    const entries = buildPhoneMessengerOtpAlternatives(allChannels, resend);
    expect(entries.map((entry) => entry.label)).toEqual([
      'Получить код в Max',
      'Получить код в Telegram',
      'Получить код по SMS',
    ]);
    await entries[0]?.onClick();
    expect(resend).toHaveBeenCalledWith('max');
  });
});

/**
 * Привязка собственного номера — другая дверь: человек уже вошёл, отказ ему показывают отказом,
 * поэтому прятать факт отправки не от кого и незачем.
 */
describe('экран кода при привязке номера', () => {
  it('говорит об отправке прямо', () => {
    expect(phoneBindOtpDescription('telegram')).toBe(
      'Код отправлен в Telegram — откройте чат с ботом.',
    );
    expect(phoneBindOtpDescription('sms')).toBe('Код отправлен SMS на указанный номер.');
  });
});
