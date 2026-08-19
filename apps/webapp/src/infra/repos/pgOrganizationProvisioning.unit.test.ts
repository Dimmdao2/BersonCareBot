import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Правило владельца 19.08: «Если вдруг за это время имя забрали - ошибка создания слаг а не
 * регистрации аккаунта». Обратная сторона того же правила — не называть именем то, что именем не
 * является: повторная заявка того же человека упирается в свои уникальные ограничения и не должна
 * выглядеть как занятое имя клиники.
 */

const runWebappPgText = vi.fn();

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgText(...args),
  runWebappTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
}));

const { createPgOrganizationProvisioningPort } = await import('./pgOrganizationProvisioning');

class PgUniqueViolation extends Error {
  code = '23505';
  constructor(public constraint: string) {
    super(`duplicate key value violates unique constraint "${constraint}"`);
  }
}

const intent = {
  challengeId: '00000000-0000-4000-8000-0000000000a1',
  emailNormalized: 'doctor@example.test',
  organizationTitle: 'Клиника',
  specialistFullName: 'Врач',
  organizationSlug: 'klinika',
};

beforeEach(() => {
  runWebappPgText.mockReset();
});

describe('чей уникальный конфликт называется занятым именем', () => {
  it('конфликт по индексу владения адресом — это занятое имя', async () => {
    runWebappPgText.mockRejectedValue(new PgUniqueViolation('uq_organization_slug_claims_slug'));

    await expect(
      createPgOrganizationProvisioningPort().createSpecialistSignupIntent(intent),
    ).rejects.toThrow('slug_unavailable');
  });

  it('повторная заявка того же человека именем не называется', async () => {
    runWebappPgText.mockRejectedValue(new PgUniqueViolation('uq_specialist_signup_intents_user_id'));

    await expect(
      createPgOrganizationProvisioningPort().createSpecialistSignupIntent(intent),
    ).rejects.toThrow(/uq_specialist_signup_intents_user_id/);
  });

  it('повторный challenge именем не называется', async () => {
    runWebappPgText.mockRejectedValue(
      new PgUniqueViolation('specialist_signup_intents_challenge_id_key'),
    );

    await expect(
      createPgOrganizationProvisioningPort().createSpecialistSignupIntent(intent),
    ).rejects.toThrow(/specialist_signup_intents_challenge_id_key/);
  });

  it('явный slug_unavailable из функции БД проходит как есть', async () => {
    runWebappPgText.mockRejectedValue(new Error('slug_unavailable'));

    await expect(
      createPgOrganizationProvisioningPort().createSpecialistSignupIntent(intent),
    ).rejects.toThrow('slug_unavailable');
  });
});
