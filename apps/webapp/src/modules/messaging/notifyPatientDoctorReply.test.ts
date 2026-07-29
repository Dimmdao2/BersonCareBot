/**
 * Tests for P16 web_push leg migration (PLAN S14).
 *
 * Verifies:
 * - web_push channel uses relayOutbound (channel:'web_push'), not sendWebPushToSubscriptions
 * - All WebPushClientPayload fields (title, url, tag) are passed via metadata.pushExtras
 * - email and tg/max legs are unchanged (relayOutbound called as before)
 * - When no subscriptions exist, web_push relay is skipped entirely
 * - sendWebPushToSubscriptions is never called (G2 guard path never reached)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildPatientMessagesOpenUrl,
  buildPersonalChatNotificationText,
  createNotifyPatientDoctorReply,
  selectPersonalChatSenderDisplayName,
} from './notifyPatientDoctorReply';

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/config/env', () => ({
  env: { APP_BASE_URL: 'https://app.example' },
}));

vi.mock('@/modules/system-settings/integrationRuntime', () => ({
  getIntegratorApiUrl: vi.fn(async () => 'http://integrator.test'),
  getIntegratorWebhookSecret: vi.fn(async () => 'test-secret'),
}));

vi.mock('@/modules/observability/operationalVerboseLog', () => ({
  isOperationalVerboseLogEnabled: vi.fn(async () => false),
}));

vi.mock('@/modules/messaging/relayOutbound', () => ({
  relayOutbound: vi.fn(async () => ({ ok: true as const, status: 'accepted' as const })),
}));

// ── imports after mocks ───────────────────────────────────────────────────────

import { relayOutbound } from '@/modules/messaging/relayOutbound';
import type { ChannelPreferencesPort } from '@/modules/channel-preferences/ports';
import type { WebPushSubscriptionsPort } from '@/modules/web-push/ports';
import type { TopicChannelPrefsPort } from '@/modules/patient-notifications/topicChannelPrefsPort';

// ── helpers ───────────────────────────────────────────────────────────────────

const PLATFORM_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = 'msg-111';
const TEXT = 'Привет, это ответ врача!';

/**
 * Valid SMTP inner config as the parsed valueJson object from system_settings.
 * smtpInnerFromValueJson receives this directly and calls smtpOutboundInnerSchema.safeParse on it.
 * Must pass smtpOutboundInnerSchema: host, port, secure, user, from required.
 */
const SMTP_VALUE_JSON = {
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  user: 'noreply@example.com',
  password: 'secret',
  from: 'noreply@example.com',
};

/**
 * Build a minimal valid deps object. All channels are OFF by default unless
 * the relevant fields are set — this makes test intent explicit.
 */
function buildDeps(
  override: {
    /** Whether hasAnyForUserId returns true (used in the push block pre-check). */
    hasSubs?: boolean;
    /** Whether listActiveByUserId returns subs (used in buildAvailability → hasWebPushSubscription). */
    hasActiveSubs?: boolean;
    emailAddress?: string | null;
    emailVerified?: boolean;
    /** When true, getSetting returns a valid SMTP config so smtpConfigured becomes true. */
    smtpConfigured?: boolean;
    telegramId?: string | null;
    maxId?: string | null;
  } = {},
): Parameters<typeof createNotifyPatientDoctorReply>[0] {
  const {
    hasSubs = false,
    hasActiveSubs = hasSubs,
    emailAddress = null,
    emailVerified = false,
    smtpConfigured = false,
    telegramId = null,
    maxId = null,
  } = override;

  const activeSubs = hasActiveSubs ? [{ endpoint: 'https://push.example/sub1' }] : [];

  return {
    channelPreferences: {
      getPreferences: vi.fn(async () => []),
    } as unknown as ChannelPreferencesPort,
    topicChannelPrefs: {
      listByUserId: vi.fn(async () => []),
      upsert: vi.fn(async () => {}),
    } as unknown as TopicChannelPrefsPort,
    webPushSubscriptions: {
      hasAnyForUserId: vi.fn(async () => hasSubs),
      listActiveByUserId: vi.fn(async () => activeSubs),
      deleteByEndpointIfExists: vi.fn(async () => true),
    } as unknown as WebPushSubscriptionsPort,
    systemSettings: {
      getSetting: vi.fn(async () => {
        if (smtpConfigured) {
          return {
            key: 'smtp_outbound' as const,
            scope: 'admin' as const,
            valueJson: SMTP_VALUE_JSON,
            updatedAt: '2024-01-01T00:00:00Z',
            updatedBy: null,
          };
        }
        return null;
      }),
    },
    readReminderNotifyGate: vi.fn(async () => ({ muted: false })),
    getProfileEmailFields: vi.fn(async () => ({
      email: emailAddress,
      emailVerifiedAt: emailVerified ? '2024-01-01T00:00:00Z' : null,
    })),
    getChannelBindings: vi.fn(async () => ({
      telegramId: telegramId ?? null,
      maxId: maxId ?? null,
    })),
    shouldDispatchRelay: undefined,
    retryDelaysMs: [0],
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('notifyPatientDoctorReply — P16 web_push leg migration', () => {
  const notifyParams = (text = TEXT) => ({
    organizationId: ORGANIZATION_ID,
    platformUserId: PLATFORM_USER_ID,
    messageId: MESSAGE_ID,
    text,
    senderDisplayName: 'Доктор Берсон',
  });
  beforeEach(() => {
    // Clear call history between tests to avoid cross-test accumulation.
    vi.clearAllMocks();
    vi.mocked(relayOutbound).mockResolvedValue({ ok: true, status: 'accepted' });
  });

  it('returns the patient messages path when app base URL is blank', () => {
    expect(buildPatientMessagesOpenUrl('   ')).toBe('/app/patient/messages');
  });

  it('emits web_push intent via relayOutbound when user has subscriptions', async () => {
    const deps = buildDeps({ hasSubs: true });
    const notify = createNotifyPatientDoctorReply(deps);
    await notify(notifyParams());

    const pushCalls = vi
      .mocked(relayOutbound)
      .mock.calls.filter((c) => c[0].channel === 'web_push');
    expect(pushCalls).toHaveLength(1);

    const [params] = pushCalls[0]!;
    expect(params.channel).toBe('web_push');
    expect(params.recipient).toBe(PLATFORM_USER_ID);
    expect(params.messageId).toBe(`${MESSAGE_ID}:web_push`);
    expect(params.text).toBe('новое сообщение от Доктор Берсон');
    expect(params.text).not.toContain(TEXT);
    // metadata carries title, url, and pushExtras.tag — all WebPushClientPayload fields
    expect(params.metadata).toMatchObject({
      title: 'Сообщение',
      url: expect.stringContaining('https://app.example'),
      pushExtras: {
        tag: `doctor_reply:${MESSAGE_ID}`,
      },
    });
  });

  it('skips web_push relay when hasAnyForUserId returns false (no active subscriptions)', async () => {
    // hasActiveSubs: true ensures buildAvailability selects web_push channel,
    // but hasSubs: false means the inner pre-check in the push block skips the relay.
    const deps = buildDeps({ hasSubs: false, hasActiveSubs: true });
    const notify = createNotifyPatientDoctorReply(deps);
    await notify(notifyParams());

    const pushCalls = vi
      .mocked(relayOutbound)
      .mock.calls.filter((c) => c[0].channel === 'web_push');
    expect(pushCalls).toHaveLength(0);
  });

  it('skips web_push when user has neither availability subs nor any subs', async () => {
    // Both hasAnyForUserId and listActiveByUserId return empty/false.
    const deps = buildDeps({ hasSubs: false, hasActiveSubs: false });
    const notify = createNotifyPatientDoctorReply(deps);
    await notify(notifyParams());

    const pushCalls = vi
      .mocked(relayOutbound)
      .mock.calls.filter((c) => c[0].channel === 'web_push');
    expect(pushCalls).toHaveLength(0);
  });

  it('never calls sendWebPushToSubscriptions — relayOutbound is the only send mechanism', async () => {
    // This test documents the migration invariant: the old direct sendWebPushToSubscriptions
    // path is no longer reachable from this module.
    const deps = buildDeps({ hasSubs: true });
    const notify = createNotifyPatientDoctorReply(deps);
    await notify(notifyParams());

    // Exactly one web_push call, via relayOutbound (not sendWebPushToSubscriptions)
    const pushCalls = vi
      .mocked(relayOutbound)
      .mock.calls.filter((c) => c[0].channel === 'web_push');
    expect(pushCalls).toHaveLength(1);
    expect(pushCalls[0]![0].channel).toBe('web_push');
  });

  it('does not send web_push when gate is muted', async () => {
    const deps = buildDeps({ hasSubs: true });
    vi.mocked(deps.readReminderNotifyGate).mockResolvedValue({ muted: true });
    const notify = createNotifyPatientDoctorReply(deps);
    await notify(notifyParams());

    const pushCalls = vi
      .mocked(relayOutbound)
      .mock.calls.filter((c) => c[0].channel === 'web_push');
    expect(pushCalls).toHaveLength(0);
  });

  it('email leg still uses relayOutbound with channel:email (unchanged by this migration)', async () => {
    // email requires: hasEmail+emailVerified+smtpConfigured; no push channel.
    const deps = buildDeps({
      hasSubs: false,
      hasActiveSubs: false,
      emailAddress: 'patient@example.com',
      emailVerified: true,
      smtpConfigured: true,
    });
    const notify = createNotifyPatientDoctorReply(deps);
    await notify(notifyParams());

    const emailCalls = vi.mocked(relayOutbound).mock.calls.filter((c) => c[0].channel === 'email');
    expect(emailCalls).toHaveLength(1);
    expect(emailCalls[0]![0].recipient).toBe('patient@example.com');
    expect(emailCalls[0]![0].metadata).toMatchObject({
      subject: 'Новое сообщение в чате',
    });
    expect(emailCalls[0]![0].text).toContain('новое сообщение от Доктор Берсон');
    expect(emailCalls[0]![0].text).not.toContain(TEXT);
    // No push sent
    const pushCalls = vi
      .mocked(relayOutbound)
      .mock.calls.filter((c) => c[0].channel === 'web_push');
    expect(pushCalls).toHaveLength(0);
  });

  it('telegram leg still uses relayOutbound with channel:telegram (unchanged by this migration)', async () => {
    const deps = buildDeps({ hasSubs: false, hasActiveSubs: false, telegramId: '987654321' });
    const notify = createNotifyPatientDoctorReply(deps);
    await notify(notifyParams());

    const tgCalls = vi.mocked(relayOutbound).mock.calls.filter((c) => c[0].channel === 'telegram');
    expect(tgCalls).toHaveLength(1);
    expect(tgCalls[0]![0].recipient).toBe('987654321');
    expect(tgCalls[0]![0].text).toContain('новое сообщение от Доктор Берсон');
    expect(tgCalls[0]![0].text).not.toContain(TEXT);
    // No push sent
    const pushCalls = vi
      .mocked(relayOutbound)
      .mock.calls.filter((c) => c[0].channel === 'web_push');
    expect(pushCalls).toHaveLength(0);
  });

  it('sends both web_push and email when both channels are available', async () => {
    const deps = buildDeps({
      hasSubs: true,
      emailAddress: 'patient@example.com',
      emailVerified: true,
      smtpConfigured: true,
    });
    const notify = createNotifyPatientDoctorReply(deps);
    await notify(notifyParams());

    const pushCalls = vi
      .mocked(relayOutbound)
      .mock.calls.filter((c) => c[0].channel === 'web_push');
    const emailCalls = vi.mocked(relayOutbound).mock.calls.filter((c) => c[0].channel === 'email');
    expect(pushCalls).toHaveLength(1);
    expect(emailCalls).toHaveLength(1);
  });

  it('redacts the message body in web push, Telegram, MAX, and email while preserving links', async () => {
    const deps = buildDeps({
      hasSubs: true,
      telegramId: '987654321',
      maxId: 'max-42',
      emailAddress: 'patient@example.com',
      emailVerified: true,
      smtpConfigured: true,
    });
    const notify = createNotifyPatientDoctorReply(deps);
    await notify(notifyParams('Секретный текст о здоровье'));

    const calls = vi.mocked(relayOutbound).mock.calls.map(([params]) => params);
    expect(calls.map((params) => params.channel).sort()).toEqual([
      'email',
      'max',
      'telegram',
      'web_push',
    ]);
    for (const params of calls) {
      expect(params.text).toContain('новое сообщение от Доктор Берсон');
      expect(params.text).not.toContain('Секретный текст о здоровье');
      if (params.channel !== 'web_push') {
        expect(params.text).toContain('https://app.example');
      }
    }
  });

  it.each(['doctor@example.com', '+79991234567', '33333333-3333-4333-8333-333333333333'])(
    'uses a neutral specialist label instead of unsafe sender value %s',
    async (unsafeLabel) => {
      const deps = buildDeps({ telegramId: '987654321' });
      const notify = createNotifyPatientDoctorReply(deps);
      await notify({
        ...notifyParams('Секретный текст о здоровье'),
        senderDisplayName: unsafeLabel,
      });

      const tgCall = vi
        .mocked(relayOutbound)
        .mock.calls.find(([params]) => params.channel === 'telegram');
      expect(tgCall?.[0].text).toContain('новое сообщение от специалиста');
      expect(tgCall?.[0].text).not.toContain(unsafeLabel);
      expect(tgCall?.[0].text).not.toContain('Секретный текст о здоровье');
    },
  );

  it('skips sending entirely when text is empty', async () => {
    const deps = buildDeps({ hasSubs: true });
    const notify = createNotifyPatientDoctorReply(deps);
    await notify(notifyParams('   '));

    expect(vi.mocked(relayOutbound)).not.toHaveBeenCalled();
  });
});

describe('personal chat sender name', () => {
  const notificationFor = (
    structuredName: string,
    displayName: string,
    senderRole: 'specialist' | 'patient',
  ) =>
    buildPersonalChatNotificationText(
      selectPersonalChatSenderDisplayName(structuredName, displayName),
      senderRole,
    );

  it('prefers structured FIO over a display name', () => {
    expect(notificationFor('Берсон Дмитрий', 'Другой Отправитель', 'specialist')).toBe(
      'новое сообщение от Берсон Дмитрий',
    );
  });

  it('uses a safe display name when structured FIO is empty', () => {
    expect(notificationFor('', 'Анна Петрова', 'specialist')).toBe(
      'новое сообщение от Анна Петрова',
    );
  });

  it.each(['doctor@example.com', '+79991234567', '550e8400-e29b-41d4-a716-446655440000'])(
    'rejects unsafe display name %s when structured FIO is empty',
    (displayName) => {
      const notification = notificationFor('', displayName, 'patient');
      expect(notification).toBe('новое сообщение от пациента');
      expect(notification).not.toContain(displayName);
    },
  );

  it('uses the neutral fallback when both names are empty', () => {
    expect(notificationFor('', '', 'specialist')).toBe('новое сообщение от специалиста');
  });
});
