/**
 * Reads appointment/booking product data from webapp GET /api/integrator/appointments/*.
 * Used when readPort delegates booking.byExternalId and booking.activeByUser to webapp projection.
 * On network/error returns null or [] (safe fallback).
 */
import { createHmac } from 'node:crypto';
import { env, integratorWebhookSecret } from '../../config/env.js';
import type {
  AppointmentsReadsPort,
  BookingRecordForLinking,
  ActiveBookingRecord,
} from '../../kernel/contracts/index.js';

function signGet(timestamp: string, canonicalGet: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${canonicalGet}`).digest('base64url');
}

type WebappRecord = {
  externalRecordId?: string;
  phoneNormalized?: string | null;
  recordAt?: string | null;
  status?: string;
  payloadJson?: unknown;
};

type WebappRecordListItem = {
  rubitimeRecordId?: string;
  recordAt?: string | null;
  status?: string;
  link?: string | null;
};

async function fetchAppointmentsGet<T>(
  pathname: string,
  search: string,
): Promise<{ ok: boolean; data?: T; status: number }> {
  const baseUrl = env.APP_BASE_URL ?? '';
  const secret = integratorWebhookSecret();
  if (!baseUrl || !secret) {
    return { ok: false, status: 0 };
  }
  const url = `${baseUrl.replace(/\/$/, '')}${pathname}${search ? `?${search}` : ''}`;
  const canonicalGet = `GET ${pathname}${search ? `?${search}` : ''}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signGet(timestamp, canonicalGet, secret);
  const headers: Record<string, string> = {
    'X-Bersoncare-Timestamp': timestamp,
    'X-Bersoncare-Signature': signature,
  };
  try {
    const res = await fetch(url, { method: 'GET', headers });
    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok && (data as { ok?: boolean }).ok === true, data, status: res.status };
  } catch (err) {
    console.warn('appointments reads GET failed', {
      pathname,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, status: 0 };
  }
}

function parseRecordAt(value: unknown): Date | null {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

export function createAppointmentsReadsPort(): AppointmentsReadsPort {
  return {
    async getRecordByExternalId(externalRecordId: string): Promise<BookingRecordForLinking | null> {
      const search = new URLSearchParams({ integratorRecordId: externalRecordId });
      const result = await fetchAppointmentsGet<{ record?: WebappRecord | null }>(
        '/api/integrator/appointments/record',
        search.toString(),
      );
      if (!result.ok) return null;
      const record = result.data?.record;
      if (record == null) return null;
      const externalId = typeof record.externalRecordId === 'string' ? record.externalRecordId : externalRecordId;
      const status = typeof record.status === 'string' ? record.status : 'updated';
      return {
        externalRecordId: externalId,
        phoneNormalized: typeof record.phoneNormalized === 'string' ? record.phoneNormalized : null,
        payloadJson: record.payloadJson ?? {},
        recordAt: parseRecordAt(record.recordAt),
        status,
      };
    },

    async getActiveRecordsByPhone(phoneNormalized: string): Promise<ActiveBookingRecord[]> {
      const search = new URLSearchParams({ phoneNormalized });
      const result = await fetchAppointmentsGet<{ records?: WebappRecordListItem[] }>(
        '/api/integrator/appointments/active-by-user',
        search.toString(),
      );
      if (!result.ok || !result.data?.records) return [];
      const rows = Array.isArray(result.data.records) ? result.data.records : [];
      return rows.map((row) => ({
        rubitimeRecordId: typeof row.rubitimeRecordId === 'string' ? row.rubitimeRecordId : '',
        recordAt: typeof row.recordAt === 'string' ? row.recordAt : (row.recordAt == null ? null : String(row.recordAt)),
        status: typeof row.status === 'string' ? row.status : 'updated',
        link: typeof row.link === 'string' ? row.link : null,
      }));
    },
  };
}
