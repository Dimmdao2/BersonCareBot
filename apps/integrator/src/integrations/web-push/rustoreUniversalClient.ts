export type RuStoreUniversalConfig = { endpoint: string; projectId: string; authToken: string };
export type RuStoreSendResult = { ok: true } | { ok: false; status?: number; code?: 'invalid_token' | 'provider_error'; invalidToken?: true };
const DEFAULT_ENDPOINT = 'https://vkpns-universal.rustore.ru/v1/send';
export async function sendRuStoreUniversalPush(input: { config: RuStoreUniversalConfig; token: string; data: Record<string, string> }): Promise<RuStoreSendResult> {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(input.config.endpoint || DEFAULT_ENDPOINT, { method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${input.config.authToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: input.config.projectId, tokens: [input.token], data: input.data }) });
    if (response.ok) return { ok: true };
    // Only explicit per-token provider vocabulary authorizes lifecycle mutation.
    const body = await response.json().catch(() => null) as { code?: unknown; invalidToken?: unknown } | null;
    const invalidToken = body?.invalidToken === true || body?.code === 'INVALID_TOKEN';
    return { ok: false, status: response.status, ...(invalidToken ? { code: 'invalid_token' as const, invalidToken: true } : { code: 'provider_error' as const }) };
  } catch { return { ok: false, code: 'provider_error' }; } finally { clearTimeout(timeout); }
}
