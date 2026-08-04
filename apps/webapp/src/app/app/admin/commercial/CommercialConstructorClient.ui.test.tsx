import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommercialConstructorClient } from './CommercialConstructorClient';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('commercial constructor access ladder', () => {
  it('does not render retired tariff controls from legacy API data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          tariffs: [
            {
              id: '11111111-1111-4111-8111-111111111199',
              name: 'Legacy tariff',
              description: '',
              priceMinor: null,
              currency: null,
              billingPeriod: 'month',
              mechanics: { booking: true, clinical_tests: false, online_intake: false },
              quotas: {},
              systemAccessPolicy: null,
              mechanicAccessPolicies: { clinical_tests: null, online_intake: null },
              downgradePolicies: { clinical_tests: 'block', online_intake: 'block' },
              includedSeats: 1,
              additionalSeatPriceMinor: null,
              isActive: true,
              createdAt: '2026-08-02T00:00:00.000Z',
              updatedAt: '2026-08-02T00:00:00.000Z',
            },
          ],
          organizations: [],
          trialPolicy: null,
          registrationTariffPolicy: { tariffId: null },
        }),
      })),
    );

    render(<CommercialConstructorClient />);

    await screen.findByText('Legacy tariff');
    expect(screen.queryByText('Клинические тесты и наборы')).not.toBeInTheDocument();
    expect(screen.queryByText('Онлайн-анкета')).not.toBeInTheDocument();
  });

  it('starts unconfigured and exposes the owner fields in product language', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          tariffs: [],
          organizations: [],
          trialPolicy: null,
          registrationTariffPolicy: { tariffId: null },
        }),
      })),
    );

    render(<CommercialConstructorClient />);
    await screen.findByRole('button', { name: 'Создать' });

    // §5a item 2.6a — «при создании тарифа по умолчанию пусть ставится одно» (owner 31.07).
    expect(screen.getByLabelText('Мест специалистов')).toHaveValue(1);
    fireEvent.click(screen.getAllByRole('button', { name: 'Настроить' })[0]!);

    expect(screen.getByText('Терпение: дней')).toBeInTheDocument();
    // The agent's single "number of warnings" is gone; уведомления — это список владельца.
    expect(screen.queryByText('Предупреждений')).not.toBeInTheDocument();
    // Т3 (owner 04.08) — templates no longer live inline in the tariff form; they moved to their
    // own «Уведомления» tab, so the row editor is absent here.
    expect(
      screen.queryByRole('button', { name: 'Добавить уведомление' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Только чтение: дней')).toBeInTheDocument();
    expect(screen.getByText('Затем')).toBeInTheDocument();
    expect(screen.queryByText(/квот/i)).not.toBeInTheDocument();
  });

  // Т1 (owner 03.08) — «Доступ к системе определяет работу всех вложенных механик»: no per-mechanic
  // form by default, only an opt-in exception; once added, it is labelled as an exception and shows
  // what it inherits.
  it('shows no per-mechanic access form by default; an added exception is labelled and shows the inherited value', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          tariffs: [],
          organizations: [],
          trialPolicy: null,
          registrationTariffPolicy: { tariffId: null },
        }),
      })),
    );

    render(<CommercialConstructorClient />);
    await screen.findByRole('button', { name: 'Создать' });

    // Before any exception exists, there is exactly one lifecycle form on the page — the system's —
    // and no mechanic carries its own "Настроить"/"Терпение: дней" box.
    expect(screen.getAllByRole('button', { name: 'Настроить' })).toHaveLength(1);
    expect(
      screen.getByText('Исключений нет — все механики наследуют доступ к системе.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Настроить' }));
    fireEvent.change(screen.getByLabelText('Доступ к системе: Терпение: дней'), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByLabelText('Доступ к системе: Только чтение: дней'), {
      target: { value: '2' },
    });
    await user.click(screen.getByLabelText('Доступ к системе: Затем'));
    await user.click(await screen.findByRole('option', { name: 'Только чтение' }));

    await user.click(screen.getByLabelText('Механика для нового исключения'));
    await user.click(await screen.findByRole('option', { name: 'Курсы' }));
    await user.click(screen.getByRole('button', { name: 'Добавить исключение' }));

    // The added row is visibly an exception, names what it overrides, and shows the inherited value.
    expect(screen.getByText('Исключение: Курсы')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Наследуемое значение (доступ к системе): терпение 3 дн., только чтение 2 дн., затем только чтение',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Убрать исключение' })).toBeInTheDocument();
    // Removing it drops the exception back to plain inheritance.
    await user.click(screen.getByRole('button', { name: 'Убрать исключение' }));
    expect(screen.queryByText('Исключение: Курсы')).not.toBeInTheDocument();
    expect(
      screen.getByText('Исключений нет — все механики наследуют доступ к системе.'),
    ).toBeInTheDocument();
  });

  it('submits and reloads system and mechanic policies without replacing owner values', async () => {
    const user = userEvent.setup();
    let savedTariff: Record<string, unknown> | null = null;
    let submitted: Record<string, unknown> | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          submitted = JSON.parse(String(init.body)) as Record<string, unknown>;
          const tariff = submitted.tariff as Record<string, unknown>;
          savedTariff = {
            ...tariff,
            id: '11111111-1111-4111-8111-111111111111',
            createdAt: '2026-07-30T00:00:00.000Z',
            updatedAt: '2026-07-30T00:00:00.000Z',
          };
          return { ok: true, json: async () => ({ ok: true, result: { created: true } }) };
        }
        return {
          ok: true,
          json: async () => ({
            ok: true,
            tariffs: savedTariff ? [savedTariff] : [],
            organizations: [],
            trialPolicy: null,
            registrationTariffPolicy: { tariffId: null },
          }),
        };
      }),
    );

    render(<CommercialConstructorClient />);
    await screen.findByRole('button', { name: 'Создать' });

    fireEvent.change(screen.getByLabelText('Название'), {
      target: { value: 'Тариф с политикой' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Настроить' }));
    fireEvent.change(screen.getByLabelText('Доступ к системе: Терпение: дней'), {
      target: { value: '6' },
    });
    fireEvent.change(screen.getByLabelText('Доступ к системе: Только чтение: дней'), {
      target: { value: '4' },
    });
    await user.click(screen.getByLabelText('Доступ к системе: Затем'));
    await user.click(await screen.findByRole('option', { name: 'Выключено' }));

    // Т1 (owner 03.08) — a mechanic-level exception is opt-in: pick it, then add it.
    // Everything not picked keeps inheriting «Доступ к системе» above.
    await user.click(screen.getByLabelText('Механика для нового исключения'));
    await user.click(await screen.findByRole('option', { name: 'Онлайн-запись' }));
    await user.click(screen.getByRole('button', { name: 'Добавить исключение' }));

    fireEvent.change(screen.getByLabelText('Исключение: Онлайн-запись: Терпение: дней'), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByLabelText('Исключение: Онлайн-запись: Только чтение: дней'), {
      target: { value: '5' },
    });
    await user.click(screen.getByLabelText('Исключение: Онлайн-запись: Затем'));
    const openSelect = document.querySelector<HTMLElement>(
      '[data-slot="select-content"][data-open]',
    );
    expect(openSelect).not.toBeNull();
    await user.click(within(openSelect!).getByRole('option', { name: 'Только чтение' }));
    await user.click(screen.getByRole('button', { name: 'Создать' }));

    await waitFor(() =>
      expect(submitted).toMatchObject({
        action: 'create_tariff',
        tariff: {
          systemAccessPolicy: {
            graceDays: 6,
            readOnlyDays: 4,
            notifications: [],
            terminalState: 'disabled',
          },
          mechanicAccessPolicies: {
            booking: {
              graceDays: 1,
              readOnlyDays: 5,
              notifications: [],
              terminalState: 'read_only',
            },
          },
        },
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: /Тариф с политикой/ }));

    expect(screen.getByLabelText('Доступ к системе: Терпение: дней')).toHaveValue(6);
    expect(screen.getByLabelText('Исключение: Онлайн-запись: Только чтение: дней')).toHaveValue(5);
    expect(screen.getByLabelText('Исключение: Онлайн-запись: Затем')).toHaveTextContent(
      'Только чтение',
    );
  });

  // Т2/Т3/Т7 (owner 04.08) — Т3 moved the letter itself off the rule row onto its own «Рассылки»
  // tab; this proves the rule row keeps offset/condition, shows a pre-Т3 row's leftover text
  // read-only instead of an inline editor, and that editing the deadline round-trips the leftover
  // text unchanged (never blanked just because no template was chosen for it yet).
  it('edits an existing notification row from the separate Уведомления tab, legacy text preserved', async () => {
    const user = userEvent.setup();
    let submitted: Record<string, unknown> | null = null;
    const existingTariff = {
      id: '11111111-1111-4111-8111-111111111177',
      name: 'Тариф с триггерами',
      description: '',
      priceMinor: null,
      currency: null,
      billingPeriod: 'month',
      mechanics: {},
      quotas: {},
      systemAccessPolicy: {
        graceDays: 6,
        readOnlyDays: 4,
        notifications: [
          {
            offsetDays: -2,
            condition: 'payment_failed',
            templateId: null,
            template: 'Оплатите {{тариф}} до {{дата}}',
          },
        ],
        terminalState: 'disabled',
      },
      mechanicAccessPolicies: {},
      downgradePolicies: {},
      mailingTemplates: [],
      includedSeats: 1,
      additionalSeatPriceMinor: null,
      discountedPriceMinor: null,
      isActive: true,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          submitted = JSON.parse(String(init.body)) as Record<string, unknown>;
          return { ok: true, json: async () => ({ ok: true, result: {} }) };
        }
        return {
          ok: true,
          json: async () => ({
            ok: true,
            tariffs: [existingTariff],
            organizations: [],
            trialPolicy: null,
            registrationTariffPolicy: { tariffId: null },
          }),
        };
      }),
    );

    render(<CommercialConstructorClient />);
    await user.click(await screen.findByRole('tab', { name: 'Уведомления' }));
    await user.click(await screen.findByRole('button', { name: /Тариф с триггерами/ }));

    // No inline editor for the letter any more — the pre-Т3 text shows read-only as a hint instead.
    expect(await screen.findByText(/Оплатите/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Текст')).not.toBeInTheDocument();
    // Т2/Т7 — all seven conditions are offered, not just the payment pair.
    expect(
      screen.getByLabelText('Доступ к системе: уведомление 1: условие'),
    ).toHaveTextContent('Ошибка оплаты');

    fireEvent.change(screen.getByLabelText('Доступ к системе: уведомление 1: срок'), {
      target: { value: '-5' },
    });
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(submitted).toMatchObject({
        action: 'update_tariff',
        tariff: {
          systemAccessPolicy: {
            notifications: [
              {
                offsetDays: -5,
                condition: 'payment_failed',
                templateId: null,
                template: 'Оплатите {{тариф}} до {{дата}}',
              },
            ],
          },
        },
      }),
    );
  });

  // §T3 — the rule POINTS AT a template chosen from the Select; this proves picking one submits
  // its id, not a copy of its text.
  it('picks a mailing template for a notification row and submits its id', async () => {
    const user = userEvent.setup();
    let submitted: Record<string, unknown> | null = null;
    const existingTariff = {
      id: '11111111-1111-4111-8111-111111111166',
      name: 'Тариф с письмом',
      description: '',
      priceMinor: null,
      currency: null,
      billingPeriod: 'month',
      mechanics: {},
      quotas: {},
      systemAccessPolicy: {
        graceDays: 1,
        readOnlyDays: 1,
        notifications: [
          { offsetDays: -1, condition: 'payment_failed', templateId: null, template: '' },
        ],
        terminalState: 'disabled',
      },
      mechanicAccessPolicies: {},
      downgradePolicies: {},
      mailingTemplates: [{ id: 'letter-1', name: 'Письмо об оплате', subject: '', body: '' }],
      includedSeats: 1,
      additionalSeatPriceMinor: null,
      discountedPriceMinor: null,
      isActive: true,
      createdAt: '2026-08-04T00:00:00.000Z',
      updatedAt: '2026-08-04T00:00:00.000Z',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          submitted = JSON.parse(String(init.body)) as Record<string, unknown>;
          return { ok: true, json: async () => ({ ok: true, result: {} }) };
        }
        return {
          ok: true,
          json: async () => ({
            ok: true,
            tariffs: [existingTariff],
            organizations: [],
            trialPolicy: null,
            registrationTariffPolicy: { tariffId: null },
          }),
        };
      }),
    );

    render(<CommercialConstructorClient />);
    await user.click(await screen.findByRole('tab', { name: 'Уведомления' }));
    await user.click(await screen.findByRole('button', { name: /Тариф с письмом/ }));

    await user.click(screen.getByLabelText('Доступ к системе: уведомление 1: шаблон'));
    await user.click(await screen.findByRole('option', { name: 'Письмо об оплате' }));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(submitted).toMatchObject({
        action: 'update_tariff',
        tariff: {
          systemAccessPolicy: {
            notifications: [expect.objectContaining({ templateId: 'letter-1' })],
          },
        },
      }),
    );
  });

  // §T3 — the letter itself is composed on the «Рассылки» tab: subject + rich body, and the
  // variable hints match what the notification code actually substitutes (accessNotifications.ts).
  it('composes a mailing template on the Рассылки tab and it round-trips', async () => {
    const user = userEvent.setup();
    let submitted: Record<string, unknown> | null = null;
    let savedTariff: Record<string, unknown> = {
      id: '11111111-1111-4111-8111-111111111188',
      name: 'Тариф для писем',
      description: '',
      priceMinor: null,
      currency: null,
      billingPeriod: 'month',
      mechanics: {},
      quotas: {},
      systemAccessPolicy: null,
      mechanicAccessPolicies: {},
      downgradePolicies: {},
      mailingTemplates: [],
      includedSeats: 1,
      additionalSeatPriceMinor: null,
      discountedPriceMinor: null,
      isActive: true,
      createdAt: '2026-08-04T00:00:00.000Z',
      updatedAt: '2026-08-04T00:00:00.000Z',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          submitted = JSON.parse(String(init.body)) as Record<string, unknown>;
          savedTariff = { ...savedTariff, ...(submitted.tariff as Record<string, unknown>) };
          return { ok: true, json: async () => ({ ok: true, result: {} }) };
        }
        return {
          ok: true,
          json: async () => ({
            ok: true,
            tariffs: [savedTariff],
            organizations: [],
            trialPolicy: null,
            registrationTariffPolicy: { tariffId: null },
          }),
        };
      }),
    );

    render(<CommercialConstructorClient />);
    await user.click(await screen.findByRole('tab', { name: 'Рассылки' }));
    await user.click(await screen.findByRole('button', { name: /Тариф для писем/ }));

    await user.click(screen.getByRole('button', { name: 'Новый шаблон' }));
    fireEvent.change(screen.getByLabelText(/Название/), {
      target: { value: 'Письмо про триал' },
    });
    fireEvent.change(screen.getByLabelText('Тема письма'), {
      target: { value: 'Ваш триал начался' },
    });

    // The variable hints are the exact list the notification code substitutes — never guessed.
    expect(screen.getByTitle('Название организации')).toHaveTextContent('{{клиника}}');
    expect(screen.getByTitle('Название тарифа')).toHaveTextContent('{{тариф}}');
    expect(screen.getByTitle('Сумма следующего платежа')).toHaveTextContent('{{сумма}}');
    expect(screen.getByTitle('Дата начала следующего оплаченного периода')).toHaveTextContent(
      '{{дата_начала_периода_автооплаты}}',
    );

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(submitted).toMatchObject({
        action: 'update_tariff',
        tariff: {
          mailingTemplates: [
            expect.objectContaining({
              name: 'Письмо про триал',
              subject: 'Ваш триал начался',
            }),
          ],
        },
      }),
    );

    // The saved letter is picked up in the list under its new name, not just held as a draft.
    // (It's also the selected row, so its accessible name carries the "Выбран" badge too.)
    expect(await screen.findByRole('button', { name: /Письмо про триал/ })).toBeInTheDocument();
  });

  it('never offers "full access" as a ladder terminal state (§5a stage 4b.2 — exactly two values)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          tariffs: [],
          organizations: [],
          trialPolicy: null,
          registrationTariffPolicy: { tariffId: null },
        }),
      })),
    );

    render(<CommercialConstructorClient />);
    await screen.findByRole('button', { name: 'Создать' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Настроить' })[0]!);
    fireEvent.click(screen.getByLabelText('Доступ к системе: Затем'));

    const openSelect = document.querySelector<HTMLElement>(
      '[data-slot="select-content"][data-open]',
    );
    expect(openSelect).not.toBeNull();
    expect(
      within(openSelect!).queryByRole('option', { name: 'Полный доступ' }),
    ).not.toBeInTheDocument();
    expect(within(openSelect!).getByRole('option', { name: 'Только чтение' })).toBeInTheDocument();
    expect(within(openSelect!).getByRole('option', { name: 'Выключено' })).toBeInTheDocument();
  });

  // Т4/Т1 (owner 03.08) — «на вкладке триала не сказано, что он перебивает»: both selects live on
  // the same «Триал» tab and must each name the precedence, not just the registration-tariff one.
  it('names the trial-over-registration precedence on both halves of the Триал tab', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          tariffs: [],
          organizations: [],
          trialPolicy: null,
          registrationTariffPolicy: { tariffId: null },
        }),
      })),
    );

    render(<CommercialConstructorClient />);
    await user.click(await screen.findByRole('tab', { name: 'Триал' }));

    expect(
      screen.getByText(/оно остаётся в приоритете, пока активно/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/перебивает стартовый тариф выше/),
    ).toBeInTheDocument();
  });
});
