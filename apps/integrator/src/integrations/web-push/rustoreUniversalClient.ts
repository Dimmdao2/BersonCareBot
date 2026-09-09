export type RuStoreUniversalConfig = { endpoint: string; projectId: string; authToken: string };
export type RuStoreSendResult =
  | { ok: true }
  | {
      ok: false;
      status?: number;
      code?: 'invalid_token' | 'provider_error';
      invalidToken?: true;
    };

const DEFAULT_ENDPOINT = 'https://vkpns-universal.rustore.ru/v1/send';

function reportsInvalidRuStoreToken(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const errors = (value as { errors?: unknown }).errors;
  return (
    Array.isArray(errors) &&
    errors.some(
      (error) =>
        typeof error === 'string' &&
        /^rustore:\s*invalid tokens(?:\b|\s|$)/i.test(error.trim()),
    )
  );
}

export async function sendRuStoreUniversalPush(input: {
  config: RuStoreUniversalConfig;
  token: string;
  data: Record<string, string>;
}): Promise<RuStoreSendResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(input.config.endpoint || DEFAULT_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providers: {
          rustore: {
            project_id: input.config.projectId,
            auth_token: input.config.authToken,
          },
        },
        tokens: { rustore: [input.token] },
        message: { data: input.data },
      }),
    });
    if (response.ok) return { ok: true };
    const body: unknown = await response.json().catch(() => null);
    const invalidToken = reportsInvalidRuStoreToken(body);
    return {
      ok: false,
      status: response.status,
      ...(invalidToken
        ? { code: 'invalid_token' as const, invalidToken: true }
        : { code: 'provider_error' as const }),
    };
  } catch {
    return { ok: false, code: 'provider_error' };
  } finally {
    clearTimeout(timeout);
  }
}
