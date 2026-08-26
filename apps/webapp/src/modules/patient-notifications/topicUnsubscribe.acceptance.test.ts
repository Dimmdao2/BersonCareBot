import { describe, expect, it, vi } from 'vitest';
import { createTopicUnsubscribeService } from './topicUnsubscribe';
import { buildTopicUnsubscribeResponseHtml } from '@/app/api/public/notifications/unsubscribe/route';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';

function tokenFromUrl(url: string): string {
  return new URL(url).searchParams.get('token') ?? '';
}

describe('topic unsubscribe signed flow', () => {
  it.each([
    ['missing', ''],
    ['short', 'short-secret'],
  ])(
    'rejects link creation and marker verification when the secret is %s',
    async (_kind, secret) => {
      const service = createTopicUnsubscribeService({
        getSecret: () => secret,
        appBaseUrl: 'https://example.test',
        setTopicEnabled: vi.fn(async () => {}),
        runForPatient: async <T>(_userId: string, _organizationId: string, action: () => Promise<T>) =>
          action(),
      });
      const validInput = {
        userId: USER_ID,
        organizationId: ORGANIZATION_ID,
        topicCode: 'patient_news',
        topicTitle: 'Новости и уведомления',
        nonce: 'broadcast-audit-missing-secret',
      };

      expect(() => service.createUrl(validInput)).toThrow('topic_unsubscribe_secret_unavailable');
      await expect(service.unsubscribeByToken('payload.signature')).rejects.toThrow(
        'topic_unsubscribe_secret_unavailable',
      );
    },
  );

  it('disables only the signed topic and makes a repeated visit idempotent', async () => {
    const state = new Map([
      ['patient_news', true],
      ['important_broadcasts', true],
    ]);
    const setTopicEnabled = vi.fn(async (_userId: string, topicCode: string, enabled: boolean) => {
      state.set(topicCode, enabled);
    });
    let runForPatientCalls = 0;
    const runForPatient = async <T>(
      _userId: string,
      _organizationId: string,
      action: () => Promise<T>,
    ): Promise<T> => {
      runForPatientCalls += 1;
      return action();
    };
    const service = createTopicUnsubscribeService({
      getSecret: () => 'unit-test-secret-at-least-16-chars',
      appBaseUrl: 'https://example.test/',
      setTopicEnabled,
      runForPatient,
    });
    const token = tokenFromUrl(
      service.createUrl({
        userId: USER_ID,
        organizationId: ORGANIZATION_ID,
        topicCode: 'patient_news',
        topicTitle: 'Новости и уведомления',
        nonce: 'broadcast-audit-1',
      }),
    );

    await expect(service.unsubscribeByToken(token)).resolves.toEqual({
      topicCode: 'patient_news',
      topicTitle: 'Новости и уведомления',
    });
    await expect(service.unsubscribeByToken(token)).resolves.toEqual({
      topicCode: 'patient_news',
      topicTitle: 'Новости и уведомления',
    });

    expect(state.get('patient_news')).toBe(false);
    expect(state.get('important_broadcasts')).toBe(true);
    expect(runForPatientCalls).toBe(2);
    expect(setTopicEnabled).toHaveBeenNthCalledWith(1, USER_ID, 'patient_news', false);
  });

  it('does not report an unsubscribe when the topic write refuses', async () => {
    const setTopicEnabled = vi.fn(async () => {
      throw new Error('notification_topic_rejected');
    });
    const onWriteFailure = vi.fn();
    const service = createTopicUnsubscribeService({
      getSecret: () => 'unit-test-secret-at-least-16-chars',
      appBaseUrl: 'https://example.test',
      setTopicEnabled,
      runForPatient: async <T>(_userId: string, _organizationId: string, action: () => Promise<T>) =>
        action(),
      onWriteFailure,
    });
    const token = tokenFromUrl(
      service.createUrl({
        userId: USER_ID,
        organizationId: ORGANIZATION_ID,
        topicCode: 'patient_news',
        topicTitle: 'Новости и уведомления',
        nonce: 'broadcast-audit-refused-write',
      }),
    );

    await expect(service.unsubscribeByToken(token)).resolves.toEqual({
      topicCode: null,
      topicTitle: null,
    });
    expect(setTopicEnabled).toHaveBeenCalledTimes(1);
    expect(onWriteFailure).toHaveBeenCalledWith(expect.any(Error));
  });

  it('rejects a tampered recipient/topic marker before the write', async () => {
    const setTopicEnabled = vi.fn(async () => {});
    const service = createTopicUnsubscribeService({
      getSecret: () => 'unit-test-secret-at-least-16-chars',
      appBaseUrl: 'https://example.test',
      setTopicEnabled,
      runForPatient: async <T>(_userId: string, _organizationId: string, action: () => Promise<T>) =>
        action(),
    });
    const token = tokenFromUrl(
      service.createUrl({
        userId: USER_ID,
        organizationId: ORGANIZATION_ID,
        topicCode: 'important_broadcasts',
        topicTitle: 'Важные рассылки',
        nonce: 'broadcast-audit-2',
      }),
    );
    const [payload, signature] = token.split('.');
    const tamperedPayload = `${payload?.slice(0, -1)}${payload?.endsWith('A') ? 'B' : 'A'}`;

    await expect(service.unsubscribeByToken(`${tamperedPayload}.${signature}`)).resolves.toEqual({
      topicCode: null,
      topicTitle: null,
    });
    expect(setTopicEnabled).not.toHaveBeenCalled();
  });

  it.each([
    ['patient_news', 'Новости и уведомления'],
    ['important_broadcasts', 'Важные рассылки'],
  ])(
    'renders the signed %s title on the unsubscribe confirmation',
    async (topicCode, topicTitle) => {
      const service = createTopicUnsubscribeService({
        getSecret: () => 'unit-test-secret-at-least-16-chars',
        appBaseUrl: 'https://example.test',
        setTopicEnabled: vi.fn(async () => {}),
        runForPatient: async <T>(_userId: string, _organizationId: string, action: () => Promise<T>) =>
          action(),
      });
      const token = tokenFromUrl(
        service.createUrl({
          userId: USER_ID,
          organizationId: ORGANIZATION_ID,
          topicCode,
          topicTitle,
          nonce: `broadcast-audit-${topicCode}`,
        }),
      );

      const result = await service.unsubscribeByToken(token);
      const html = buildTopicUnsubscribeResponseHtml(result);

      expect(html).toContain(`«${topicTitle}»`);
      expect(html).toContain('Остальные уведомления продолжат приходить.');
      expect(html).toContain('/app/patient/notifications/settings');
    },
  );
});
