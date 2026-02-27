import fetch from 'node-fetch';
import type { SmsClient } from './types.js';

type WarnLogger = {
  warn(payload: Record<string, unknown>, message: string): void;
  error(payload: Record<string, unknown>, message: string): void;
};

type SmscClientConfig = {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  log: WarnLogger;
};

type SmscResponse = {
  id?: number;
  cnt?: number;
  error?: string;
  error_code?: number;
};

/** Создает рабочий клиент SMSC с HTTP-вызовом API провайдера. */
export function createSmscClient(config: SmscClientConfig): SmsClient {
  const baseUrl = config.baseUrl ?? 'https://smsc.ru/sys/send.php';
  const timeoutMs = config.timeoutMs ?? 10_000;

  return {
    async sendSms(input) {
      if (!input.toPhone || !input.message) {
        return { ok: false, error: 'SMSC_INVALID_INPUT' };
      }

      const params = new URLSearchParams({
        apikey: config.apiKey,
        phones: input.toPhone,
        mes: input.message,
        fmt: '3',
      });

      try {
        const res = await fetch(`${baseUrl}?${params.toString()}`, {
          method: 'GET',
          signal: AbortSignal.timeout(timeoutMs),
        });

        const raw = await res.text();
        let parsed: SmscResponse | null = null;
        try {
          parsed = JSON.parse(raw) as SmscResponse;
        } catch {
          parsed = null;
        }

        if (!res.ok) {
          config.log.error(
            { status: res.status, statusText: res.statusText, body: raw.slice(0, 300) },
            'smsc request failed',
          );
          return { ok: false, error: `SMSC_HTTP_${res.status}` };
        }

        if (parsed?.error || typeof parsed?.error_code === 'number') {
          const errorCode = typeof parsed.error_code === 'number' ? String(parsed.error_code) : 'UNKNOWN';
          const errorText = parsed.error ?? 'SMSC_API_ERROR';
          return { ok: false, error: `${errorText} (code: ${errorCode})` };
        }

        return { ok: true };
      } catch (err) {
        config.log.error(
          {
            err,
            toPhone: input.toPhone,
            messageLength: input.message.length,
          },
          'smsc transport error',
        );
        return { ok: false, error: 'SMSC_TRANSPORT_ERROR' };
      }
    },
  };
}
