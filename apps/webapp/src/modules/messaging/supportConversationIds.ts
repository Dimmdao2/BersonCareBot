/** Канонический ключ диалога поддержки на платформенного пользователя (webapp + integrator). */
export const WEBAPP_PLATFORM_CONVERSATION_PREFIX = 'webapp:platform:';
export const WEBAPP_ORGANIZATION_CONVERSATION_PREFIX = 'webapp:organization:';

export function webappPlatformConversationId(platformUserId: string): string {
  return `${WEBAPP_PLATFORM_CONVERSATION_PREFIX}${platformUserId.trim()}`;
}

export function webappOrganizationConversationId(
  organizationId: string,
  platformUserId: string,
): string {
  return `${WEBAPP_ORGANIZATION_CONVERSATION_PREFIX}${organizationId.trim()}:platform:${platformUserId.trim()}`;
}

export type ParsedWebappConversationId =
  | { scope: 'platform'; platformUserId: string }
  | { scope: 'organization'; organizationId: string; platformUserId: string };

export function parseWebappConversationId(
  integratorConversationId: string,
): ParsedWebappConversationId | null {
  const id = integratorConversationId.trim();
  if (id.startsWith(WEBAPP_PLATFORM_CONVERSATION_PREFIX)) {
    const platformUserId = id.slice(WEBAPP_PLATFORM_CONVERSATION_PREFIX.length).trim();
    return platformUserId ? { scope: 'platform', platformUserId } : null;
  }
  if (!id.startsWith(WEBAPP_ORGANIZATION_CONVERSATION_PREFIX)) return null;
  const scoped = id.slice(WEBAPP_ORGANIZATION_CONVERSATION_PREFIX.length);
  const platformMarker = ':platform:';
  const markerIndex = scoped.indexOf(platformMarker);
  if (markerIndex <= 0) return null;
  const organizationId = scoped.slice(0, markerIndex).trim();
  const platformUserId = scoped.slice(markerIndex + platformMarker.length).trim();
  return organizationId && platformUserId
    ? { scope: 'organization', organizationId, platformUserId }
    : null;
}

export function parsePlatformUserIdFromWebappConversationId(
  integratorConversationId: string,
): string | null {
  return parseWebappConversationId(integratorConversationId)?.platformUserId ?? null;
}

export function isWebappPlatformConversationId(integratorConversationId: string): boolean {
  return parsePlatformUserIdFromWebappConversationId(integratorConversationId) !== null;
}
