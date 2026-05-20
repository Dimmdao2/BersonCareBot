/** Канонический ключ диалога поддержки на платформенного пользователя (webapp + integrator). */
export const WEBAPP_PLATFORM_CONVERSATION_PREFIX = "webapp:platform:";

export function webappPlatformConversationId(platformUserId: string): string {
  return `${WEBAPP_PLATFORM_CONVERSATION_PREFIX}${platformUserId.trim()}`;
}

export function parsePlatformUserIdFromWebappConversationId(
  integratorConversationId: string,
): string | null {
  const id = integratorConversationId.trim();
  if (!id.startsWith(WEBAPP_PLATFORM_CONVERSATION_PREFIX)) return null;
  const rest = id.slice(WEBAPP_PLATFORM_CONVERSATION_PREFIX.length).trim();
  return rest.length > 0 ? rest : null;
}

export function isWebappPlatformConversationId(integratorConversationId: string): boolean {
  return parsePlatformUserIdFromWebappConversationId(integratorConversationId) !== null;
}
