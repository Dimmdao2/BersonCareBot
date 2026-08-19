import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Правило владельца 19.08, дословно: «я запретил бронировать имя и slug клиники до момента создания
 * аккаунта ... сейчас должна быть последовательность либо в одной транзакции либо - регистрация и сразу
 * потом запись слаг и имени. Если вдруг за это время имя забрали - ошибка создания слаг а не регистрации
 * аккаунта.»
 *
 * Здесь закрепляется ПОРЯДОК и адресат отказа, а не форма кода: что до подтверждения регистрации имя
 * нигде не занимается, и что перехваченное имя возвращается ошибкой ИМЕНИ.
 */

const runWebappPgText = vi.fn();

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgText(...args),
  runWebappTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
}));

const { createPgOrganizationProvisioningPort } = await import('./pgOrganizationProvisioning');

const intent = {
  challengeId: '00000000-0000-4000-8000-0000000000a1',
  emailNormalized: 'doctor@example.test',
  organizationTitle: 'Клиника',
  specialistFullName: 'Врач',
  organizationSlug: 'klinika',
};

function invokedSql(): string {
  return runWebappPgText.mock.calls.map((call) => String(call[0])).join('\n');
}

beforeEach(() => {
  runWebappPgText.mockReset();
});

describe('имя клиники не занимается до создания аккаунта', () => {
  it('создание намерения не трогает пространство имён адресов', async () => {
    runWebappPgText.mockResolvedValue({ rows: [] });

    await createPgOrganizationProvisioningPort().createSpecialistSignupIntent(intent);

    const sql = invokedSql();
    // Единственная дверь на этом шаге — запись самого намерения.
    expect(sql).toContain('app.create_specialist_signup_intent');
    // И ни одной записи во владение адресом: именно это владелец и запретил. Если кто-то добавит сюда
    // бронь «чтобы имя не увели», тест покраснеет — а человек к этому моменту ещё без клиники.
    expect(sql).not.toContain('organization_slug_claims');
    expect(sql.toLowerCase()).not.toContain('reserve');
  });

  it('перехваченное имя — ошибка ИМЕНИ, а не общий отказ регистрации', async () => {
    runWebappPgText.mockResolvedValue({
      rows: [
        {
          ok: false,
          code: 'slug_unavailable',
          organization_id: null,
          specialist_id: null,
          membership_id: null,
        },
      ],
    });

    const port = createPgOrganizationProvisioningPort();

    // `slug_unavailable` — единственный код, который маршрут подтверждения переводит в 409 про имя
    // (PROVISIONING_ERROR_RULES в api/auth/specialist-signup/confirm/route.ts). Любой другой код там
    // становится `provisioning_pending` 503, то есть «регистрация не удалась» — ровно то, что владелец
    // назвал неверным поведением.
    await expect(port.provisionSpecialistOwner({ challengeId: intent.challengeId })).rejects.toThrow(
      'slug_unavailable',
    );
  });

  it('провал провижининга без причины не выдаёт себя за занятое имя', async () => {
    runWebappPgText.mockResolvedValue({
      rows: [
        {
          ok: false,
          code: null,
          organization_id: null,
          specialist_id: null,
          membership_id: null,
        },
      ],
    });

    const port = createPgOrganizationProvisioningPort();

    // Обратная сторона того же правила: не называть именем то, что именем не является.
    await expect(port.provisionSpecialistOwner({ challengeId: intent.challengeId })).rejects.toThrow(
      'specialist_signup_provision_insert_failed',
    );
  });
});
