import { describe, expect, it, vi, beforeEach } from 'vitest';
import { isPasswordEligibleRole } from '@/modules/auth/passwordEligibility';

const startEmailChallenge = vi.fn();

vi.mock('@/modules/auth/emailAuth', () => ({
  startEmailChallenge: (...args: unknown[]) => startEmailChallenge(...args),
}));

beforeEach(() => {
  startEmailChallenge.mockReset();
  startEmailChallenge.mockResolvedValue({ ok: true, challengeId: 'c1' });
});

describe('contact email setup for a doctor-created patient', () => {
  /**
   * Д6/F7: пациенту нельзя высылать письмо, которое обещает пароль. Не потому что «так решили», а
   * потому что закончить этот путь он физически не может: `setup-code/complete` после верного кода
   * отказывает роли `client`. Поэтому проверяем не букву значения, а несовместимость двух живых
   * путей — вид вызова, который завершение обязано отвергнуть, не должен отсюда уходить вовсе.
   */
  it('never starts a challenge whose completion would refuse a patient', async () => {
    const { createPgEmailSetupAccessPort } = await import('./pgEmailSetupAccessPort');
    const port = createPgEmailSetupAccessPort();

    const result = await port.requestContactEmailSetup({
      userId: '00000000-0000-4000-8000-000000000001',
      emailNormalized: 'patient@example.test',
      source: 'doctor_profile',
    });

    expect(result.ok).toBe(true);
    expect(startEmailChallenge).toHaveBeenCalledTimes(1);
    const purpose = startEmailChallenge.mock.calls[0]?.[2] as string;

    // Пароль в продукте есть только у ролей, которые проходят этот предикат; `client` его не проходит,
    // значит любой парольный вид вызова для пациента — это письмо в тупик.
    expect(isPasswordEligibleRole('client')).toBe(false);
    expect(purpose).not.toMatch(/password/u);
  });
});
