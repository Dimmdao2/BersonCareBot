import { randomUUID } from 'node:crypto';
import type { ExecutorDeps } from '../executor/helpers.js';
import { webappPlatformConversationId } from '../../../shared/support/platformConversationId.js';

export function adminReplyConversationId(
  integratorConversationId: string,
  platformUserId: string | null,
): string {
  return platformUserId ? webappPlatformConversationId(platformUserId) : integratorConversationId;
}

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

export async function applyWebappAdminReplyFromMessenger(
  deps: ExecutorDeps,
  input: {
    integratorConversationId: string;
    text: string;
    createdAt: string;
    senderDisplayName?: string;
    adminMessageId?: string | null;
    programNoteStageItemId?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const apply = deps.webappEventsPort?.applySupportAdminReply;
  if (!apply) return { ok: false, error: 'webapp_events_port_missing' };
  const integratorMessageId = input.adminMessageId?.trim() || `integrator-admin:${randomUUID()}`;
  const body = JSON.stringify({
    integratorConversationId: input.integratorConversationId,
    integratorMessageId,
    text: input.text,
    ...(input.senderDisplayName?.trim()
      ? { senderDisplayName: input.senderDisplayName.trim() }
      : {}),
    createdAt: input.createdAt,
    ...(input.programNoteStageItemId?.trim()
      ? { programNoteStageItemId: input.programNoteStageItemId.trim() }
      : {}),
  });
  const result = await apply({
    body,
    idempotencyKey: `support-admin:${integratorMessageId}`,
  });
  if (!result.ok) {
    return { ok: false, error: result.error ?? `http_${result.status}` };
  }
  return { ok: true };
}
