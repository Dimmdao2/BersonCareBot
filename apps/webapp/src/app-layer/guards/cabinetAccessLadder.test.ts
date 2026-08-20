// §5a/2.1a — ДОСТУП В КАБИНЕТ как отдельный предмет лестницы. Owner 30.07: «и сам доступ к кабинету
// и доступ к механикам внутри тарифа. Как долго период терпения с полным доступом, как долго период
// только на чтение, когда блок».
//
// Здесь доказывается ПОВЕДЕНИЕ двери кабинета на каждой ступени, через настоящий страж
// (`requireRole`) и настоящий роут — подменены только слои под стражем. Сама лестница (три величины
// тарифа → три ступени, и восстановление данных в БД) доказывается на живом PostgreSQL скриптом
// Named-DEV access-ladder proof; здесь — что вебапп этим состоянием реально
// распоряжается.
//
// Арбитр (обязателен per `.cursor/rules/tests-check-behaviour-not-circumstances.mdc`) — по одному на
// проверку, каждый назван у своего `it`.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  loggerError: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: vi.fn() }));
vi.mock('@/modules/auth/service', () => ({
  getCurrentSession: vi.fn(),
  getCurrentSessionForIdentitySelf: vi.fn(),
}));
vi.mock('@bersoncare/db-principal', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ensureDbPrincipalContext: vi.fn(),
  enterWithDbStaffPrincipal: vi.fn(),
  getCurrentDbPrincipal: vi.fn(() => null),
  runWithDbClinicBillingPrincipal: <T>(_principal: unknown, callback: () => T): T => callback(),
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: vi.fn(<T>(_ctx: unknown, _source: string, fn: () => T): T => fn()),
}));
vi.mock('@/app-layer/logging/logger', () => ({
  logger: { error: fakes.loggerError },
}));

import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { getCurrentSession } from '@/modules/auth/service';
import { GET as listCourses } from '@/app/api/doctor/courses/route';
import { GET as readOwnBilling, POST as payOwnBilling } from '@/app/api/clinic/billing/route';
import { cabinetGraceWarningMessages } from './cabinetAccessGate';
import type { CabinetAccessResolution, MechanicAccessState } from '@/modules/org-entitlements/types';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SPECIALIST_ID = '33333333-3333-4333-8333-333333333333';

const EXISTING_COURSES = [
  { id: 'course-1', title: 'Курс 1' },
  { id: 'course-2', title: 'Курс 2' },
];

const BILLING_OVERVIEW = {
  organizationId: ORG_ID,
  subscriptions: [{ id: 'subscription-1', status: 'active' }],
  invoices: [{ id: 'invoice-1', status: 'pending' }],
  providerEvents: [],
};

/** The clinic owner: full workspace capabilities, 2FA already satisfied. */
const session = {
  user: {
    userId: USER_ID,
    role: 'doctor',
    displayName: 'Врач',
    securityFactorRequired: false,
    bindings: {},
  },
  staffSecurity: { assurance: 'factor_verified' },
};

const listCoursesForDoctor = vi.fn();
const getOrganizationBillingOverview = vi.fn();
const getOwnTariffChangeState = vi.fn();
const createOwnTariffRenewalInvoice = vi.fn();

/**
 * Wires the whole stack under the guard. `cabinet` is the ONLY thing that varies between the rungs:
 * membership, session, mechanic access and the stores stay identical, so any behaviour difference
 * observed below is attributable to the cabinet ladder and nothing else.
 */
function withCabinet(cabinet: CabinetAccessResolution | Error): void {
  vi.mocked(buildAppDeps).mockReturnValue({
    organizationMembership: {
      resolveOrganizationForUser: async () => ({
        ok: true,
        context: {
          organizationId: ORG_ID,
          membershipId: 'membership-1',
          role: 'owner',
          specialistId: SPECIALIST_ID,
          canManageOrganization: true,
          canManageAllSpecialists: true,
          canAccessClinicalWorkspace: true,
        },
      }),
    },
    orgEntitlements: {
      resolveCabinetAccess: async () => {
        if (cabinet instanceof Error) throw cabinet;
        return cabinet;
      },
      // The mechanic itself is wide open on every rung below — only the cabinet moves.
      resolveMechanicAccess: async (_organizationId: string, mechanic: string) => ({
        mechanic,
        state: 'full_access' as MechanicAccessState,
        policySource: 'system',
        warning: null,
      }),
    },
    courses: { listCoursesForDoctor },
    saasBilling: { getOrganizationBillingOverview, getOwnTariffChangeState, createOwnTariffRenewalInvoice },
  } as unknown as ReturnType<typeof buildAppDeps>);
}

function cabinetAt(
  state: MechanicAccessState,
  warning: CabinetAccessResolution['warning'] = null,
): CabinetAccessResolution {
  return { state, policySource: state === 'unconfigured' ? 'unconfigured' : 'system', warning };
}

function coursesRequest(): Request {
  return new Request('https://app.example.test/api/doctor/courses', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentSession).mockResolvedValue(session as never);
  listCoursesForDoctor.mockResolvedValue(EXISTING_COURSES);
  getOrganizationBillingOverview.mockResolvedValue(BILLING_OVERVIEW);
  getOwnTariffChangeState.mockResolvedValue(null);
  createOwnTariffRenewalInvoice.mockResolvedValue({
    id: 'invoice-own-tariff-1',
    providerCheckoutUrl: 'https://billing.example.test/checkout-own-tariff-1',
  });
});

describe('§5a/2.1a: cabinet entry walks its own three rungs', () => {
  // Арбитр: снять ступень `grace` из `isCabinetEntryBlocked` (сделать её блокирующей) — тест краснеет
  // (403 вместо 200).
  it('терпение — вход в кабинет открыт, работает как при полном доступе', async () => {
    withCabinet(
      cabinetAt('grace', {
        until: '2026-08-14',
        periodEndsAt: '2026-08-01T00:00:00.000Z',
        periodSource: 'paid_period',
        notifications: [],
        nextState: 'read_only',
      }),
    );

    const response = await listCourses(coursesRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, items: EXISTING_COURSES });
  });

  // Арбитр: добавить `read_only` в `isCabinetEntryBlocked` — тест краснеет (403 вместо 200).
  // Ступень «только чтение» закрывает ЗАПИСЬ (через лестницу механик, наследующую системную
  // политику), но НЕ вход: иначе клиника не смогла бы ни увидеть созданное, ни выгрузить его —
  // канон §4a: «клиника видит созданное и может выгрузить».
  it('только чтение — вход в кабинет открыт и созданное по-прежнему видно', async () => {
    withCabinet(cabinetAt('read_only'));

    const response = await listCourses(coursesRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, items: EXISTING_COURSES });
  });

  // Арбитр: убрать проверку `cabinetEntryIsBlocked` из `requireDoctorWorkspaceApiContext` — тест
  // краснеет (200 вместо 403).
  it('блок — вход в продукт закрыт целиком, а не отдельный раздел', async () => {
    withCabinet(cabinetAt('disabled'));

    const response = await listCourses(coursesRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'cabinet_blocked' });
    // Дверь отказывает ДО обращения к хранилищу.
    expect(listCoursesForDoctor).not.toHaveBeenCalled();
  });

  // Арбитр: вернуть `unconfigured` в разряд открытых состояний — тест краснеет.
  it('ненастроенная политика — дверь закрыта, а не открыта по умолчанию', async () => {
    withCabinet(cabinetAt('unconfigured'));

    const response = await listCourses(coursesRequest());

    expect(response.status).toBe(403);
    expect(listCoursesForDoctor).not.toHaveBeenCalled();
  });

  // Арбитр: заменить `catch { return true }` в `cabinetEntryIsBlocked` на `return false` — тест
  // краснеет. Недоступный резолвер не имеет права открывать коммерческую границу.
  it('недоступный резолвер закрывает дверь, а не открывает её', async () => {
    const resolverFailure = Object.assign(new Error('resolver_unavailable'), { code: '42501' });
    withCabinet(resolverFailure);

    const response = await listCourses(coursesRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'cabinet_blocked' });
    expect(listCoursesForDoctor).not.toHaveBeenCalled();
    expect(fakes.loggerError).toHaveBeenCalledWith(
      {
        err: resolverFailure,
        organizationId: ORG_ID,
        classification: 'cabinet_access_resolver_failed',
      },
      'cabinet_access_resolver_failed',
    );
  });
});

describe('§5a/2.1a: блок кабинета не удаляет данные и возвращает их при возобновлении', () => {
  // Арбитр: заставить дверь при `disabled` звать хранилище на удаление — тест краснеет на
  // `not.toHaveBeenCalled`. Либо «залипить» решение (всегда `disabled`) — краснеет второй запрос.
  it('те же самые записи возвращаются после снятия блока, без отдельного шага восстановления', async () => {
    withCabinet(cabinetAt('disabled'));

    const blocked = await listCourses(coursesRequest());
    expect(blocked.status).toBe(403);
    expect(listCoursesForDoctor).not.toHaveBeenCalled();

    // Меняется ТОЛЬКО состояние лестницы — ничего не перепровизионивается руками.
    withCabinet(cabinetAt('full_access'));

    const restored = await listCourses(coursesRequest());
    expect(restored.status).toBe(200);
    await expect(restored.json()).resolves.toMatchObject({ ok: true, items: EXISTING_COURSES });
  });
});

describe('§5a/2.1a + 2.6a: предупреждение ступени «терпение» — текст ВЛАДЕЛЬЦА, не фраза кода', () => {
  const warning = {
    until: '2026-08-14',
    periodEndsAt: '2026-08-01T00:00:00.000Z',
    // Строки владельца здесь про НЕОПЛАТУ, поэтому и период — оплаченный (§5a item 7.0).
    periodSource: 'paid_period' as const,
    nextState: 'read_only' as const,
    notifications: [
      {
        offsetDays: -3,
        condition: 'payment_failed' as const,
        template: 'Клиника {{клиника}}: тариф {{тариф}} не оплачен, доступ сузится.',
      },
      {
        offsetDays: 2,
        condition: 'payment_failed' as const,
        template: 'Ещё не наступило: {{клиника}}.',
      },
      {
        offsetDays: -3,
        condition: 'payment_succeeded' as const,
        template: 'Чужое условие: оплата прошла.',
      },
    ],
  };

  // Арбитр: вернуть в `cabinetGraceWarningMessages` собственную фразу кода — тест краснеет,
  // потому что в выводе появится текст, которого владелец не писал.
  it('рендерит строку владельца с подстановкой переменных', () => {
    expect(
      cabinetGraceWarningMessages(
        warning,
        { клиника: 'Ромашка', тариф: 'Базовый' },
        new Date('2026-07-30T00:00:00.000Z'),
      ),
    ).toEqual(['Клиника Ромашка: тариф Базовый не оплачен, доступ сузится.']);
  });

  // Арбитр: снять фильтр срока или фильтр условия в `dueAccessNotifications` — тест краснеет,
  // потому что покажется ненаступившая строка или строка про успешную оплату.
  it('не показывает ненаступившее и чужое условие', () => {
    const shown = cabinetGraceWarningMessages(
      warning,
      { клиника: 'Ромашка', тариф: 'Базовый' },
      new Date('2026-07-30T00:00:00.000Z'),
    );

    expect(shown).not.toContain('Ещё не наступило: Ромашка.');
    expect(shown).not.toContain('Чужое условие: оплата прошла.');
  });

  // Тариф без строк уведомлений — это ответ настройки, а не повод подставить текст от себя.
  it('без строк уведомлений не показывает ничего', () => {
    expect(
      cabinetGraceWarningMessages(
        { ...warning, notifications: [] },
        { клиника: 'Ромашка', тариф: 'Базовый' },
        new Date('2026-07-30T00:00:00.000Z'),
      ),
    ).toEqual([]);
  });

  // §5a item 7.0. Поломка, которую ловит: условие «ошибка оплаты» выставлено не по настоящему
  // признаку неоплаты, а по факту деградации — и клиника, у которой просто кончился ПРОБНЫЙ
  // период и которой мы ни разу не выставляли счёт, получает текст владельца «тариф не оплачен».
  // До 31.07 обе двери подставляли `condition: 'payment_failed'` константой, и это было именно так.
  // Арбитр: заставить `accessNotificationConditionFor` возвращать `'payment_failed'` всегда —
  // второй `expect` краснеет, потому что триальной клинике покажется текст про неоплату.
  it('«ошибка оплаты» — по неоплаченному периоду, а не по истёкшему триалу', () => {
    const variables = { клиника: 'Ромашка', тариф: 'Базовый' };
    const now = new Date('2026-07-30T00:00:00.000Z');

    expect(cabinetGraceWarningMessages({ ...warning, periodSource: 'paid_period' }, variables, now))
      .toEqual(['Клиника Ромашка: тариф Базовый не оплачен, доступ сузится.']);

    expect(
      cabinetGraceWarningMessages({ ...warning, periodSource: 'trial' }, variables, now),
    ).toEqual([]);
  });
});

describe('§5a/2.1c: организация в блоке открывает СВОЙ тариф', () => {
  // Арбитр: убрать `{ allowCabinetRecovery: true }` из `app/api/clinic/billing/route.ts` — тест
  // краснеет (403 `cabinet_blocked` вместо 200). Причина инварианта: иначе блок нельзя снять
  // оплатой, и он становится невыходимым.
  it('счета и подписки своего тарифа читаются даже в конечном состоянии «блок»', async () => {
    withCabinet(cabinetAt('disabled'));

    const response = await readOwnBilling();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      billing: {
        organizationId: ORG_ID,
        subscriptions: BILLING_OVERVIEW.subscriptions,
        invoices: BILLING_OVERVIEW.invoices,
      },
    });
  });

  it('и при этом обычный раздел кабинета той же организации остаётся закрытым', async () => {
    withCabinet(cabinetAt('disabled'));

    // Один и тот же принципал, одно и то же состояние лестницы: разница только в том, что оплата
    // своего тарифа — путь восстановления, а не тарифная механика.
    expect((await readOwnBilling()).status).toBe(200);
    expect((await listCourses(coursesRequest())).status).toBe(403);
  });

  // К0, владелец 01.08 (PAYMENTS_CABINET_PLAN.md): «оплата тарифа НИКОГДА не гейтится лестницей
  // доступа. Заблокированная клиника обязана иметь возможность заплатить и разблокироваться».
  // Арбитр: убрать `{ allowCabinetRecovery: true }` из POST в `app/api/clinic/billing/route.ts` —
  // тест краснеет (403 `cabinet_blocked` вместо 200 со ссылкой на оплату), потому что тогда блок
  // становится невыходимым: заплатить может только тот, кому уже открыли кабинет.
  it('счёт на оплату своего тарифа выставляется даже в конечном состоянии «блок»', async () => {
    withCabinet(cabinetAt('disabled'));

    const response = await payOwnBilling(new Request('http://test/api/clinic/billing', { method: 'POST' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      checkoutUrl: 'https://billing.example.test/checkout-own-tariff-1',
      invoiceId: 'invoice-own-tariff-1',
    });
    expect(createOwnTariffRenewalInvoice).toHaveBeenCalledWith(ORG_ID);
  });
});
