import type { ExecutorDeps } from '../executor/helpers.js';

export async function resolvePlatformUserIdForChannel(
  deps: ExecutorDeps,
  channelCode: string,
  externalId: string,
): Promise<string | null> {
  if (!deps.readPort) return null;
  const id = await deps.readPort.readDb<string | null>({
    type: 'platformUser.idByChannelBinding',
    params: { channelCode, externalId },
  });
  return typeof id === 'string' && id.trim().length > 0 ? id.trim() : null;
}

export async function setWebappSupportStatus(
  deps: ExecutorDeps,
  input: {
    integratorConversationId: string;
    status: 'open' | 'closed';
    lastMessageAt?: string | null;
    closedAt?: string | null;
    closeReason?: string | null;
  },
): Promise<{ canonicalWrite?: { conversationId: string; organizationId: string } }> {
  const setStatus = deps.webappEventsPort?.setSupportStatus;
  if (!setStatus) return {};
  const body = JSON.stringify(input);
  const result = await setStatus({
    body,
    idempotencyKey: `support-status:${input.integratorConversationId}:${input.status}:${input.closedAt ?? input.lastMessageAt ?? ''}`,
  });
  if (!result.ok) {
    console.warn(
      '[support] set webapp support status failed',
      result.status,
      result.error ?? 'unknown',
    );
    return {};
  }
  return result.canonicalWrite ? { canonicalWrite: result.canonicalWrite } : {};
}
