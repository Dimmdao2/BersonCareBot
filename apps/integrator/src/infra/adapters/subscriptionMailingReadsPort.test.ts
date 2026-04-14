/* eslint-disable no-secrets/no-secrets -- test names reference port method names */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config/env.js', () => ({
  env: { APP_BASE_URL: 'https://webapp.test' },
  integratorWebhookSecret: () => 'test-secret-16chars!!',
}));

vi.mock('../../config/appBaseUrl.js', () => ({
  getAppBaseUrl: async () => 'https://webapp.test',
}));

import type { DbPort } from '../../kernel/contracts/index.js';
import { createSubscriptionMailingReadsPort } from './subscriptionMailingReadsPort.js';

const mockDb = {} as DbPort;

const originalFetch = globalThis.fetch;

describe('subscriptionMailingReadsPort', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('listTopics returns mapped array when ok', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        topics: [
          { id: '1', code: 'news', title: 'News', key: 'news', isActive: true },
        ],
      }),
    });
    const port = createSubscriptionMailingReadsPort({ db: mockDb });
    const list = await port.listTopics();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://webapp.test/api/integrator/subscriptions/topics');
    expect(opts?.headers?.['X-Bersoncare-Timestamp']).toBeDefined();
    expect(opts?.headers?.['X-Bersoncare-Signature']).toBeDefined();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      integratorTopicId: '1',
      code: 'news',
      title: 'News',
      key: 'news',
      isActive: true,
    });
  });

  it('listTopics returns [] when fetch rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const port = createSubscriptionMailingReadsPort({ db: mockDb });
    const list = await port.listTopics();
    expect(list).toEqual([]);
  });

  it('listTopics returns [] when status !== 200', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ ok: false }),
    });
    const port = createSubscriptionMailingReadsPort({ db: mockDb });
    const list = await port.listTopics();
    expect(list).toEqual([]);
  });

  it('listTopics returns [] when response ok is false', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: false }),
    });
    const port = createSubscriptionMailingReadsPort({ db: mockDb });
    const list = await port.listTopics();
    expect(list).toEqual([]);
  });

  it('getSubscriptionsByUserId returns mapped array when ok', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        subscriptions: [
          { topicId: '1', topicCode: 'news', isActive: true },
        ],
      }),
    });
    const port = createSubscriptionMailingReadsPort({ db: mockDb });
    const list = await port.getSubscriptionsByUserId('42');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/api/integrator/subscriptions/for-user');
    expect(url).toContain('integratorUserId=42');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      integratorTopicId: '1',
      topicCode: 'news',
      isActive: true,
    });
  });

  it('getSubscriptionsByUserId returns [] when fetch rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const port = createSubscriptionMailingReadsPort({ db: mockDb });
    const list = await port.getSubscriptionsByUserId('42');
    expect(list).toEqual([]);
  });

  it('getSubscriptionsByUserId returns [] when status !== 200', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ ok: false }),
    });
    const port = createSubscriptionMailingReadsPort({ db: mockDb });
    const list = await port.getSubscriptionsByUserId('42');
    expect(list).toEqual([]);
  });
});
