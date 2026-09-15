import { describe, expect, it, vi } from 'vitest';
import type { OutboundMessageQueuePort } from '@/modules/messaging/outboundMessageQueuePort';
import type { SessionUser } from '@/shared/types/session';
import { enqueueAccountMergeLoginNotification } from './accountMergeNotification';

describe('account merge login notification', () => {
  it('enqueues a warning to every messenger binding retained by the canonical account', async () => {
    const enqueue = vi.fn<OutboundMessageQueuePort['enqueue']>(async () => true);
    const user: SessionUser = {
      userId: '00000000-0000-4000-8000-000000000001',
      role: 'client',
      displayName: 'Пациент',
      bindings: { telegramId: 'telegram-new' },
    };

    const result = await enqueueAccountMergeLoginNotification(
      user,
      '00000000-0000-4000-8000-000000000002',
      [
        { channelCode: 'telegram', externalId: 'telegram-new' },
        { channelCode: 'telegram', externalId: 'telegram-old' },
        { channelCode: 'max', externalId: 'max-old' },
      ],
      { enqueue } satisfies OutboundMessageQueuePort,
    );

    expect(result).toEqual({ failed: 0 });
    expect(enqueue.mock.calls.map(([message]) => [message.channel, message.recipient])).toEqual([
      ['telegram', 'telegram-new'],
      ['telegram', 'telegram-old'],
      ['max', 'max-old'],
      ['web_push', user.userId],
    ]);
  });
});
