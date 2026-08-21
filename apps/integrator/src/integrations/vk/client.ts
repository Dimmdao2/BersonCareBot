import { createHash } from 'node:crypto';

const VK_API_VERSION = '5.131';
const VK_API_BASE = 'https://api.vk.ru/method';
export type VkClientConfig = { accessToken: string };
export type VkFetch = typeof fetch;

export class VkApiError extends Error {
  constructor(readonly code: number | null, readonly apiMessage: string) {
    super(`VK_API_ERROR${code === null ? '' : `_${code}`}: ${apiMessage}`);
    this.name = 'VkApiError';
  }
}

function randomIdFor(eventId: string): number {
  const id = createHash('sha256').update(eventId).digest().readUInt32BE(0) & 0x7fffffff;
  return id === 0 ? 1 : id;
}

async function invoke<T>(config: VkClientConfig, method: string, body: Record<string, string>, fetchImpl: VkFetch): Promise<T> {
  const response = await fetchImpl(`${VK_API_BASE}/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ ...body, v: VK_API_VERSION }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload: unknown = await response.json().catch(() => null);
  const apiError = payload && typeof payload === 'object' && 'error' in payload
    ? (payload as { error?: { error_code?: unknown; error_msg?: unknown } }).error : undefined;
  if (!response.ok || apiError) {
    throw new VkApiError(
      typeof apiError?.error_code === 'number' ? apiError.error_code : null,
      typeof apiError?.error_msg === 'string' ? apiError.error_msg : `HTTP ${response.status}`,
    );
  }
  if (!payload || typeof payload !== 'object' || !('response' in payload)) throw new VkApiError(null, 'malformed VK API response');
  return (payload as { response: T }).response;
}

export function sendVkMessage(config: VkClientConfig, input: { userId: number; text: string; eventId: string }, fetchImpl: VkFetch = fetch): Promise<number> {
  return invoke(config, 'messages.send', { user_id: String(input.userId), message: input.text, random_id: String(randomIdFor(input.eventId)) }, fetchImpl);
}

export function answerVkMessageEvent(config: VkClientConfig, input: { eventId: string; userId: number; peerId: number; eventData: string }, fetchImpl: VkFetch = fetch): Promise<number> {
  return invoke(config, 'messages.sendMessageEventAnswer', { event_id: input.eventId, user_id: String(input.userId), peer_id: String(input.peerId), event_data: input.eventData }, fetchImpl);
}
