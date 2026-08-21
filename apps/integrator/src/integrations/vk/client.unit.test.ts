import { describe, expect, it } from 'vitest';
import { sendVkMessage, type VkFetch } from './client.js';

describe('sendVkMessage', () => {
  it('uses documented messages.send form fields and a stable non-zero random_id', async () => {
    const calls: RequestInit[] = [];
    const fetchImpl: VkFetch = async (_input, init) => {
      calls.push(init ?? {});
      return new Response(JSON.stringify({ response: 42 }), { status: 200 });
    };

    await sendVkMessage({ accessToken: 'token' }, { userId: 17, text: 'Привет', eventId: 'delivery-1' }, fetchImpl);
    await sendVkMessage({ accessToken: 'token' }, { userId: 17, text: 'Привет', eventId: 'delivery-1' }, fetchImpl);

    const first = calls[0];
    const second = calls[1];
    expect((first?.headers as Record<string, string> | undefined)?.Authorization).toBe('Bearer token');
    const firstForm = new URLSearchParams(String(first?.body));
    const secondForm = new URLSearchParams(String(second?.body));
    expect(firstForm.get('user_id')).toBe('17');
    expect(firstForm.get('message')).toBe('Привет');
    expect(firstForm.get('v')).toBe('5.131');
    expect(Number(firstForm.get('random_id'))).toBeGreaterThan(0);
    expect(firstForm.get('random_id')).toBe(secondForm.get('random_id'));
  });

  it('normalizes a provider error instead of treating its HTTP response as delivered', async () => {
    const fetchImpl: VkFetch = async () => new Response(
      JSON.stringify({ error: { error_code: 901, error_msg: 'recipient denied' } }),
      { status: 200 },
    );

    await expect(sendVkMessage({ accessToken: 'token' }, { userId: 17, text: 'Привет', eventId: 'delivery-2' }, fetchImpl))
      .rejects.toMatchObject({ code: 901, apiMessage: 'recipient denied' });
  });
});
