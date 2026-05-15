import { describe, expect, it } from 'vitest';
import type { OutgoingIntent } from '../../../kernel/contracts/index.js';
import type { OutgoingDeliveryQueueRow } from '../../db/repos/outgoingDeliveryQueue.js';
import { enrichDoctorBroadcastIntentIfNeeded } from './doctorBroadcastIntentMenu.js';

describe('enrichDoctorBroadcastIntentIfNeeded', () => {
  const menu = {
    templatePort: {} as never,
    contentPort: {} as never,
    sendMenuOnButtonPress: false,
  };

  const baseIntent: OutgoingIntent = {
    type: 'message.send',
    meta: {
      eventId: 'e1',
      occurredAt: '2026-01-01T00:00:00.000Z',
      source: 'telegram',
      userId: 'user-uuid',
    },
    payload: {
      recipient: { chatId: 1 },
      message: { text: 'Hi' },
      delivery: { channels: ['telegram'], maxAttempts: 1 },
    },
  };

  it('returns same intent when attachMenu is false', async () => {
    const row = {
      channel: 'telegram',
      payloadJson: { attachMenu: false, broadcastAuditId: 'a', clientUserId: 'u' },
    } as unknown as OutgoingDeliveryQueueRow;
    const out = await enrichDoctorBroadcastIntentIfNeeded({
      db: {} as never,
      row,
      intent: baseIntent,
      menu,
    });
    expect(out).toBe(baseIntent);
  });

  it('returns same intent for sms rows', async () => {
    const row = {
      channel: 'sms',
      payloadJson: { attachMenu: true, broadcastAuditId: 'a', clientUserId: 'u' },
    } as unknown as OutgoingDeliveryQueueRow;
    const out = await enrichDoctorBroadcastIntentIfNeeded({
      db: {} as never,
      row,
      intent: baseIntent,
      menu,
    });
    expect(out).toBe(baseIntent);
  });
});
