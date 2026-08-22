import { describe, expect, it, vi } from 'vitest';
import { createTopicUnsubscribeService } from './topicUnsubscribe';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function tokenFromUrl(url: string): string {
  return new URL(url).searchParams.get('token') ?? '';
}

describe('topic unsubscribe signed flow', () => {
  it('disables only the signed topic and makes a repeated visit idempotent', async () => {
    const state = new Map([
      ['patient_news', true],
      ['important_broadcasts', true],
    ]);
    const setTopicEnabled = vi.fn(async (_userId: string, topicCode: string, enabled: boolean) => {
      state.set(topicCode, enabled);
    });
    let runForPatientCalls = 0;
    const runForPatient = async <T>(_userId: string, action: () => Promise<T>): Promise<T> => {
      runForPatientCalls += 1;
      return action();
    };
    const service = createTopicUnsubscribeService({
      secret: 'unit-test-secret-at-least-16-chars',
      appBaseUrl: 'https://example.test/',
      setTopicEnabled,
      runForPatient,
    });
    const token = tokenFromUrl(
      service.createUrl({
        userId: USER_ID,
        topicCode: 'patient_news',
        nonce: 'broadcast-audit-1',
      }),
    );

    await expect(service.unsubscribeByToken(token)).resolves.toBe('applied');
    await expect(service.unsubscribeByToken(token)).resolves.toBe('applied');

    expect(state.get('patient_news')).toBe(false);
    expect(state.get('important_broadcasts')).toBe(true);
    expect(runForPatientCalls).toBe(2);
    expect(setTopicEnabled).toHaveBeenNthCalledWith(1, USER_ID, 'patient_news', false);
  });

  it('rejects a tampered recipient/topic marker before the write', async () => {
    const setTopicEnabled = vi.fn(async () => {});
    const service = createTopicUnsubscribeService({
      secret: 'unit-test-secret-at-least-16-chars',
      appBaseUrl: 'https://example.test',
      setTopicEnabled,
      runForPatient: async <T>(_userId: string, action: () => Promise<T>) => action(),
    });
    const token = tokenFromUrl(
      service.createUrl({
        userId: USER_ID,
        topicCode: 'important_broadcasts',
        nonce: 'broadcast-audit-2',
      }),
    );
    const [payload, signature] = token.split('.');
    const tamperedPayload = `${payload?.slice(0, -1)}${payload?.endsWith('A') ? 'B' : 'A'}`;

    await expect(service.unsubscribeByToken(`${tamperedPayload}.${signature}`)).resolves.toBe(
      'invalid',
    );
    expect(setTopicEnabled).not.toHaveBeenCalled();
  });
});
