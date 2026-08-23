/**
 * D25 focused re-audit (auditor-live, 23.08.2026) — the last step of the owner's flow.
 *
 * Owner decision «Роль бота после появления приложения» (23.08.2026): «Только после этого бот
 * доставляет код, который человек вводит обратно в приложении.» The webapp keeps ownership of the
 * account and returns the freshly created OTP to the signed integrator caller
 * (`completePhoneMessengerBind` → `otpCode`); delivering it to the person is the bot's half of the
 * contract, and `telegram:phoneAuthLoginCode` / `max:phoneAuthLoginCode` /
 * `*:phoneAuthAccountCreated` are the templates that carry it (`… введите код {{code}}`).
 *
 * These cases pin the delivered text, not the shape of the code that builds it: whatever the webapp
 * returned as `otpCode` must be readable in the outgoing intent. Until `06165b670` no active
 * Telegram/MAX script reached `webapp.phoneMessengerBind.complete`, so this last step was never
 * exercised; the D25 content rewrite made it the only way a person can finish logging in.
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createContentPort } from '../../../infra/adapters/contentPort.js';
import { createTemplatePort } from '../../../infra/adapters/templatePort.js';
import type {
  DomainContext,
  OrchestratorInput,
  OutgoingIntent,
  WebappEventsPort,
} from '../../contracts/index.js';
import { buildPlan } from '../../orchestrator/resolver.js';
import { executeAction } from './executeAction.js';

const OTP_CODE = '482913';
const ATTEMPT_PHONE = '+79180000011';

function context(source: 'telegram' | 'max'): DomainContext {
  return {
    event: {
      type: 'message.received',
      meta: {
        eventId: `event-984-code-${source}`,
        occurredAt: '2026-08-23T10:30:00.000Z',
        source,
        userId: source === 'telegram' ? '99311' : '99312',
      },
      payload: {
        incoming: {
          chatId: source === 'telegram' ? 99311 : '99312',
          phone: ATTEMPT_PHONE,
          phonePresent: true,
        },
      },
    },
    nowIso: '2026-08-23T10:30:00.000Z',
    values: {},
    base: {
      actor: { isAdmin: false },
      identityLinks: [],
      facts: { links: { webappHomeUrl: 'https://app.example.test/auth' } },
    },
  };
}

function portReturning(
  result: Awaited<ReturnType<NonNullable<WebappEventsPort['completePhoneMessengerBind']>>>,
): WebappEventsPort {
  return {
    completePhoneMessengerBind: async () => result,
  } as unknown as WebappEventsPort;
}

async function completeAndReadText(
  source: 'telegram' | 'max',
  result: Awaited<ReturnType<NonNullable<WebappEventsPort['completePhoneMessengerBind']>>>,
): Promise<{ status: string; text: string }> {
  const contentPort = createContentPort({ rootDir: path.resolve(process.cwd(), 'src/content') });
  const templatePort = createTemplatePort({ contentPort });
  const actionResult = await executeAction(
    {
      id: `phone-bind-complete-${source}`,
      type: 'webapp.phoneMessengerBind.complete',
      mode: 'sync',
      params: {
        channelCode: source,
        externalId: source === 'telegram' ? '99311' : '99312',
        phoneNormalized: ATTEMPT_PHONE,
      },
    },
    context(source),
    { contentPort, templatePort, webappEventsPort: portReturning(result) },
  );

  const texts = (actionResult.intents ?? [])
    .map((intent: OutgoingIntent) => {
      const message = (intent.payload as { message?: { text?: unknown } }).message;
      return typeof message?.text === 'string' ? message.text : '';
    })
    .join('\n');

  return { status: actionResult.status, text: texts };
}

function startInput(source: 'telegram' | 'max'): OrchestratorInput {
  return {
    event: {
      type: 'message.received',
      meta: {
        eventId: `event-984-start-${source}`,
        occurredAt: '2026-08-23T10:30:00.000Z',
        source,
        userId: source === 'telegram' ? '99311' : '99312',
      },
      payload: {
        incoming: {
          chatId: source === 'telegram' ? 99311 : '99312',
          text: '/start auth_993deeplink',
          action: 'start.phoneauth',
          authSecret: 'auth_993deeplink',
        },
      },
    },
    context: { actor: { isAdmin: false }, identityLinks: [], facts: {} },
  };
}

describe('D25 — the active deep-link start routes to the signed claim, not to a generic write', () => {
  it.each(['telegram', 'max'] as const)(
    '%s: /start auth_<token> is planned as webapp.phoneMessengerBind.claim carrying the exact token and external id',
    async (source) => {
      const contentPort = createContentPort({
        rootDir: path.resolve(process.cwd(), 'src/content'),
      });
      const plan = await buildPlan(startInput(source), {
        contentPort,
        contextQueryPort: { request: async () => ({}) },
      });

      expect(plan.map((step) => step.kind)).toEqual(['webapp.phoneMessengerBind.claim']);
      expect(plan[0]?.payload).toMatchObject({
        setupToken: 'auth_993deeplink',
        channelCode: source,
        externalId: source === 'telegram' ? '99311' : '99312',
      });
      expect(JSON.stringify(plan)).not.toContain('user.phone.link');
    },
  );
});

describe('D25 — the bot delivers the login code the webapp minted for the claimed attempt', () => {
  it('Telegram: a completed login attempt sends the webapp OTP to the person', async () => {
    const { status, text } = await completeAndReadText('telegram', {
      ok: true,
      purpose: 'login',
      otpCode: OTP_CODE,
      accountCreated: false,
      challengeId: 'challenge-1',
    });

    expect(status).toBe('success');
    expect(text).toContain(OTP_CODE);
  });

  it('MAX: a completed login attempt sends the webapp OTP to the person', async () => {
    const { status, text } = await completeAndReadText('max', {
      ok: true,
      purpose: 'login',
      otpCode: OTP_CODE,
      accountCreated: false,
      challengeId: 'challenge-1',
    });

    expect(status).toBe('success');
    expect(text).toContain(OTP_CODE);
  });

  it('Telegram: a first-time registration also carries the code, not an empty placeholder', async () => {
    const { status, text } = await completeAndReadText('telegram', {
      ok: true,
      purpose: 'login',
      otpCode: OTP_CODE,
      accountCreated: true,
      challengeId: 'challenge-1',
    });

    expect(status).toBe('success');
    expect(text).toContain(OTP_CODE);
  });
});
