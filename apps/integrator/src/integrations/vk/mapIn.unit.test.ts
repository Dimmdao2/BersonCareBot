import { describe, expect, it } from 'vitest';
import { fromVk } from './mapIn.js';

describe('fromVk', () => {
  it('maps text and makes attachment-only messages explicitly unsupported', () => {
    expect(fromVk({ type: 'message_new', object: { from_id: 17, peer_id: 17, id: 9, text: 'Привет' } }))
      .toMatchObject({ kind: 'message', channelId: '17', relayMessageType: 'text' });
    expect(fromVk({ type: 'message_new', object: { from_id: 17, peer_id: 17, attachments: [{ type: 'photo' }] } }))
      .toMatchObject({ kind: 'message', relayMessageType: 'unsupported' });
  });

  it('maps callback event identity and canonical action', () => {
    expect(fromVk({ type: 'message_event', object: { event_id: 'evt', user_id: 17, peer_id: 17, payload: 'booking.open' } }))
      .toMatchObject({ kind: 'callback', action: 'booking.open', callbackQueryId: 'evt:17:17' });
  });
});
