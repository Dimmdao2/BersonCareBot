import { beforeEach, describe, expect, it, vi } from 'vitest';
import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { createPasswordAltchaService } from '@/modules/auth/passwordAltcha';
import { createBookingFormService } from '@/modules/booking-form/service';
import { createLeadsService } from '@/modules/leads/service';
import type { BookingFormFieldRecord } from '@/modules/booking-form/ports';
import { defaultDoctorWorkspaceComposition } from '@/modules/system-settings/doctorWorkspaceComposition';

/**
 * Л3, публичный приём заявки. Дверь стоит снаружи сессии кабинета и принимает чужие персональные
 * данные, поэтому проверяется НАБЛЮДАЕМЫЙ исход цепочки: создалась строка заявки или нет. Капча
 * здесь настоящая (тот же `createPasswordAltchaService`, что в рантайме) — иначе «капча проверена»
 * означало бы только «мок вернул true».
 */

const fakes = vi.hoisted(() => ({
  session: vi.fn(),
  rateLimited: vi.fn(),
  mechanicAccess: vi.fn(),
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: vi.fn(),
}));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({ ensureAuthModulePortsBound: vi.fn() }));
vi.mock('@/modules/auth/service', () => ({ getCurrentSessionForIdentitySelf: fakes.session }));
vi.mock('@/modules/public-booking/publicBookingRateLimit', () => ({
  PUBLIC_LEAD_RATE_LIMIT_SEC: 3600,
  isPublicLeadSubmitRateLimited: fakes.rateLimited,
  resolvePublicBookingRateLimitClientKey: () => ({ ok: true, key: 'ip-1' }),
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withExplicitOrganizationPrincipal: (_p: unknown, run: () => Promise<unknown>) => run(),
}));
vi.mock('@/modules/org-entitlements/service', () => ({
  resolveMechanicAccess: fakes.mechanicAccess,
}));
vi.mock('@/app-layer/entitlements/mechanicWriteClearance', () => ({
  runWithMechanicWriteClearance: (_m: string, run: () => Promise<unknown>) => run(),
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: () => deps }));

import { POST } from './route';

const ORG_A = '00000000-0000-4000-8000-0000000000aa';
const ORG_B = '00000000-0000-4000-8000-0000000000bb';
const USER = '00000000-0000-4000-8000-0000000000c1';
const ROOT_SECRET = 'l3-audit-root-secret';

type CreatedLead = {
  organizationId: string;
  platformUserId: string;
  phoneNormalized: string | null;
  preferredContact: string | null;
  messageText: string;
};
let created: CreatedLead[] = [];
/** Конфигурация полей клиники: что арендатор включил и что сделал обязательным. */
let configuredFields: BookingFormFieldRecord[] = [];
/** Состав кабинета арендатора: включена ли у него механика заявок. */
let workspaceComposition = defaultDoctorWorkspaceComposition();

function field(
  fieldKey: string,
  extra: Partial<BookingFormFieldRecord> = {},
): BookingFormFieldRecord {
  return {
    id: `field-${fieldKey}`,
    organizationId: ORG_A,
    formSurface: 'leads',
    fieldKey,
    fieldType: fieldKey === 'phone' ? 'phone' : 'free_text',
    label: fieldKey,
    placeholder: null,
    isRequired: false,
    visibleToPatient: true,
    visibleToStaff: true,
    sortOrder: 10,
    isActive: true,
    archivedAt: null,
    ...extra,
  } as BookingFormFieldRecord;
}

/**
 * Одноразовость задачки капчи живёт в базе (`password_altcha_challenges.consumed_at`), поэтому
 * здесь подменяется ровно эта грань: выдача помнит задачку, приём гасит её атомарно и ровно раз.
 * Крипто-проверка при этом настоящая — повтор payload она принимает всегда, и отбить его может
 * только гашение.
 */
let issuedChallenges = new Map<string, { identifierKey: string; digest: string; consumed: boolean }>();

const altcha = createPasswordAltchaService({
  readAltchaRootSecret: async () => ROOT_SECRET,
  readCaptchaConfig: async () => ({
    provider: 'altcha' as const,
    yandexClientKey: null,
    yandexServerKey: null,
  }),
  registerPublicLeadAltchaChallenge: async ({
    identifierKey,
    challengeId,
    challengeDigest,
  }: {
    identifierKey: string;
    challengeId: string;
    challengeDigest: string;
  }) => {
    issuedChallenges.set(challengeId, { identifierKey, digest: challengeDigest, consumed: false });
    return true;
  },
  consumePublicLeadAltchaChallenge: async ({
    identifierKey,
    challengeId,
    challengeDigest,
  }: {
    identifierKey: string;
    challengeId: string;
    challengeDigest: string;
  }) => {
    const row = issuedChallenges.get(challengeId);
    if (
      !row ||
      row.consumed ||
      row.identifierKey !== identifierKey ||
      row.digest !== challengeDigest
    ) {
      return false;
    }
    row.consumed = true;
    return true;
  },
} as never);

const bookingFormPort = {
  listActiveFields: async () => configuredFields,
} as never;

const leadsPort = {
  create: async (input: CreatedLead) => {
    created.push(input);
    return { id: 'lead-1', organizationId: input.organizationId } as never;
  },
} as never;

const deps = {
  clinicDirectory: {
    resolveOrganizationIdBySlug: async (slug: string) =>
      slug === 'clinic-a' ? ORG_A : slug === 'clinic-b' ? ORG_B : null,
  },
  systemSettings: {
    getDoctorWorkspaceComposition: async () => workspaceComposition,
  },
  orgEntitlements: {},
  passwordAltcha: altcha,
  bookingForm: createBookingFormService(bookingFormPort),
  leads: createLeadsService(leadsPort),
};

/** Ровно то, что делает виджет: решает выданный вызов и кодирует payload. */
async function solvedCaptchaFor(email: string): Promise<string> {
  const issued = await altcha.issuePublicLead(email);
  if (!issued || issued.provider !== 'altcha') throw new Error('no challenge');
  const solution = await solveChallenge({ challenge: issued.challenge, deriveKey });
  if (!solution) throw new Error('unsolved');
  return Buffer.from(
    JSON.stringify({ challenge: issued.challenge, solution }),
    'utf8',
  ).toString('base64');
}

function post(body: Record<string, unknown>) {
  return POST(
    new Request('http://localhost/api/leads/public/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

const EMAIL = 'visitor@example.test';

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    orgSlug: 'clinic-a',
    email: EMAIL,
    messageText: 'Хочу записаться',
    sourceSurface: 'public_page',
    personalDataConsent: true,
    ...overrides,
  };
}

beforeEach(() => {
  created = [];
  issuedChallenges = new Map();
  configuredFields = [field('email', { isRequired: true }), field('message', { isRequired: true })];
  workspaceComposition = defaultDoctorWorkspaceComposition();
  fakes.rateLimited.mockResolvedValue(false);
  fakes.mechanicAccess.mockResolvedValue({ state: 'full_access' });
  fakes.session.mockResolvedValue({
    user: {
      userId: USER,
      contacts: [{ kind: 'email', value: EMAIL, confirmedAt: '2026-09-15T00:00:00.000Z' }],
    },
  });
});

describe('Л3 публичный приём заявки — отказ вместо заявки', () => {
  it('без капчи заявка не создаётся', async () => {
    const response = await post(baseBody());
    expect([response.status, (await response.json()).error]).toEqual([403, 'captcha_required']);
    expect(created).toEqual([]);
  });

  it('капча, решённая для чужого адреса, заявку не создаёт', async () => {
    const response = await post(
      baseBody({ captcha: await solvedCaptchaFor('someone-else@example.test') }),
    );
    expect([response.status, (await response.json()).error]).toEqual([403, 'captcha_required']);
    expect(created).toEqual([]);
  });

  it('при исчерпанном лимите частоты заявка не создаётся', async () => {
    fakes.rateLimited.mockResolvedValue(true);
    const response = await post(baseBody({ captcha: await solvedCaptchaFor(EMAIL) }));
    expect(response.status).toBe(429);
    expect(created).toEqual([]);
  });

  it('без согласия на обработку ПДн заявка не создаётся', async () => {
    const response = await post(
      baseBody({ personalDataConsent: false, captcha: await solvedCaptchaFor(EMAIL) }),
    );
    expect(response.status).toBe(400);
    expect(created).toEqual([]);
  });

  it('без подтверждённой почты в сессии заявка не создаётся', async () => {
    fakes.session.mockResolvedValue({
      user: { userId: USER, contacts: [{ kind: 'email', value: EMAIL, confirmedAt: null }] },
    });
    const response = await post(baseBody({ captcha: await solvedCaptchaFor(EMAIL) }));
    expect([response.status, (await response.json()).error]).toEqual([
      403,
      'lead_email_verification_required',
    ]);
    expect(created).toEqual([]);
  });

  it('пройденная дверь создаёт ровно одну заявку', async () => {
    const response = await post(baseBody({ captcha: await solvedCaptchaFor(EMAIL) }));
    expect(response.status).toBe(201);
    expect(created).toHaveLength(1);
  });

  // Д4: решённый payload криптографически верен всё окно жизни задачки, поэтому «капча пройдена»
  // без гашения означает «одно решение — сколько угодно заявок», то есть цены у капчи нет вовсе.
  it('один решённый payload принимается ровно один раз', async () => {
    const captcha = await solvedCaptchaFor(EMAIL);
    const first = await post(baseBody({ captcha }));
    const second = await post(baseBody({ captcha }));
    expect([first.status, second.status]).toEqual([201, 403]);
    expect(await second.json()).toMatchObject({ error: 'captcha_required' });
    expect(created).toHaveLength(1);
  });
});

describe('Л3 публичный приём заявки — чужая клиника и настроенные поля', () => {
  it('клиника берётся из адреса визитки, а не из тела запроса', async () => {
    await post(baseBody({ orgSlug: 'clinic-b', captcha: await solvedCaptchaFor(EMAIL) }));
    expect(created.map((lead) => lead.organizationId)).toEqual([ORG_B]);
  });

  it('заявка в неизвестную клинику не создаётся', async () => {
    const response = await post(
      baseBody({ orgSlug: 'no-such-clinic', captcha: await solvedCaptchaFor(EMAIL) }),
    );
    expect(response.status).toBe(404);
    expect(created).toEqual([]);
  });

  it('заявка не создаётся, когда арендатор выключил механику заявок', async () => {
    fakes.mechanicAccess.mockResolvedValue({ state: 'no_access' });
    const response = await post(baseBody({ captcha: await solvedCaptchaFor(EMAIL) }));
    expect(response.status).toBe(404);
    expect(created).toEqual([]);
  });

  it('пропущенное обязательное поле клиники заявку не создаёт', async () => {
    configuredFields = [...configuredFields, field('phone', { isRequired: true })];
    const response = await post(baseBody({ captcha: await solvedCaptchaFor(EMAIL) }));
    expect([response.status, (await response.json()).error]).toEqual([
      400,
      'required_field_missing',
    ]);
    expect(created).toEqual([]);
  });

  it('обязательный телефон и способ связи едут в заявку, а личность остаётся почтовой', async () => {
    // §18в канона идентичности: телефон из заявки идентичностью не становится. Заявитель — учётная
    // запись подтверждённой почты, а телефон виден врачу как оставленный контакт.
    configuredFields = [
      ...configuredFields,
      field('phone', { isRequired: true }),
      field('preferred_contact'),
    ];
    const response = await post(
      baseBody({
        phone: '+79990000000',
        preferredContact: 'Звонить после 18:00',
        captcha: await solvedCaptchaFor(EMAIL),
      }),
    );
    expect(response.status).toBe(201);
    expect(created).toMatchObject([
      {
        platformUserId: USER,
        phoneNormalized: '+79990000000',
        preferredContact: 'Звонить после 18:00',
      },
    ]);
  });

  it('мусор в телефоне отвечает 400 invalid_phone и заявку не создаёт', async () => {
    configuredFields = [...configuredFields, field('phone')];
    const response = await post(
      baseBody({ phone: 'not-a-phone', captcha: await solvedCaptchaFor(EMAIL) }),
    );
    expect([response.status, (await response.json()).error]).toEqual([400, 'invalid_phone']);
    expect(created).toEqual([]);
  });

  it('значение поля, выключенного клиникой, в заявку не попадает', async () => {
    configuredFields = [...configuredFields, field('phone', { isActive: false })];
    await post(baseBody({ phone: '+79990000000', captcha: await solvedCaptchaFor(EMAIL) }));
    expect(created.map((lead) => lead.phoneNormalized)).toEqual([null]);
    expect(created.map((lead) => lead.platformUserId)).toEqual([USER]);
  });
});
