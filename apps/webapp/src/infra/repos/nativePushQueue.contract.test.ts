/**
 * Final #915 auditor-live queue contract.
 *
 * Failure caught: an explicit native Push surface is dropped while an otherwise valid logical
 * web_push intent crosses the existing durable queue root.
 */
import { describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  runWebappNamedRoot: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: () => fakes.db,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
}));

import { createPgOutboundMessageQueue } from './pgOutboundMessageQueue';

describe('native Push surface through the durable outbound queue — M6-05', () => {
  it('preserves the typed surface inside the one queue-root JSON payload', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({ rows: [{ enqueued: true }] });

    await expect(
      createPgOutboundMessageQueue().enqueue({
        organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        purpose: 'video_meeting.invitation',
        idempotencyKey: 'invite-1:web_push',
        channel: 'web_push',
        recipient: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        content: {
          text: 'Вас пригласили на видеовстречу.',
          title: 'Приглашение на видеовстречу',
          url: '/app/patient/video-meetings/meeting-1',
          pushExtras: { pushSurface: 'therapygo' },
        },
      }),
    ).resolves.toBe(true);

    expect(fakes.runWebappNamedRoot).toHaveBeenCalledOnce();
    const serializedContent = fakes.runWebappNamedRoot.mock.calls[0]![2][5];
    expect(JSON.parse(String(serializedContent))).toMatchObject({
      pushExtras: { pushSurface: 'therapygo' },
    });
  });
});
