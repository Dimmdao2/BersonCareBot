import { createHmac } from "node:crypto";
import { getIntegratorApiUrl, getIntegratorWebhookSecret } from "@/modules/system-settings/integrationRuntime";
import type { BookingSlot, BookingSlotsByDate } from "@/modules/patient-booking/types";
import type { BookingSlotsIntegratorQuery, BookingSyncPort, CreateBookingSyncInput } from "@/modules/patient-booking/ports";

/** Default offset for integrator `times[]` when expanding v2 slots (MSK). */
const DEFAULT_SLOT_TZ = "+03:00";

async function normalizeBaseUrl(): Promise<string | null> {
  const base = (await getIntegratorApiUrl()).trim();
  if (!base) return null;
  return base.replace(/\/$/, "");
}

async function postSigned(path: string, body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> {
  const base = await normalizeBaseUrl();
  const secret = (await getIntegratorWebhookSecret()).trim();
  if (!base || !secret) {
    throw new Error("integrator_not_configured");
  }
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("base64url");
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Bersoncare-Timestamp": timestamp,
      "X-Bersoncare-Signature": signature,
    },
    body: raw,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

const POST_SIGNED_RETRY_BACKOFF_MS = [1000, 2000, 4000] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryablePostSignedFailure(err: unknown): boolean {
  return err instanceof TypeError;
}

async function postSignedWithRetry(path: string, body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await postSigned(path, body);
      if (result.status >= 400 && result.status < 500) {
        return result;
      }
      if (result.status >= 500) {
        lastError = new Error(`integrator_http_${result.status}`);
        if (attempt < 2) {
          await sleep(POST_SIGNED_RETRY_BACKOFF_MS[attempt] ?? 2000);
          continue;
        }
        return result;
      }
      return result;
    } catch (e) {
      lastError = e;
      if (isRetryablePostSignedFailure(e) && attempt < 2) {
        await sleep(POST_SIGNED_RETRY_BACKOFF_MS[attempt] ?? 2000);
        continue;
      }
      throw e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("integrator_request_failed");
}

function integratorErrorCode(json: Record<string, unknown>): string {
  const err = json.error;
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string") {
    return (err as { code: string }).code.trim();
  }
  return "rubitime_slots_failed";
}

/**
 * Проверяет, что integrator вернул корректный контракт слотов (v1: массив дней с `slots[]` ISO).
 */
function validateV1SlotsContract(json: Record<string, unknown>): BookingSlotsByDate[] {
  const raw = json.slots;
  if (!Array.isArray(raw)) {
    throw new Error("rubitime_slots_contract_broken: slots is not an array in integrator response");
  }
  return raw as BookingSlotsByDate[];
}

function toIsoWithOffset(date: string, timeHHMM: string, tzOffset: string): string {
  const parts = timeHHMM.trim().split(":");
  const hh = (parts[0] ?? "0").padStart(2, "0");
  const mm = (parts[1] ?? "00").padStart(2, "0");
  return `${date}T${hh}:${mm}:00${tzOffset}`;
}

function addMinutesToIso(isoWithOffset: string, minutes: number): string {
  const ms = Date.parse(isoWithOffset);
  if (Number.isNaN(ms)) throw new Error("invalid_slot_time");
  return new Date(ms + minutes * 60_000).toISOString();
}

/**
 * v2 contract: `slots: { date, times: string[] }[]` → BookingSlotsByDate с длительностью услуги.
 */
function normalizeV2SlotsPayload(raw: unknown, durationMinutes: number, tzOffset: string): BookingSlotsByDate[] {
  if (!Array.isArray(raw)) {
    throw new Error("rubitime_slots_contract_broken: v2 slots is not an array");
  }
  return raw.map((day, idx) => {
    if (!day || typeof day !== "object") {
      throw new Error(`rubitime_slots_contract_broken: v2 slots[${idx}] is not an object`);
    }
    const d = (day as { date?: unknown }).date;
    const times = (day as { times?: unknown }).times;
    if (typeof d !== "string" || !Array.isArray(times)) {
      throw new Error(`rubitime_slots_contract_broken: v2 slots[${idx}] missing date/times`);
    }
    const slots: BookingSlot[] = [];
    for (const t of times) {
      if (typeof t !== "string") continue;
      const startAt = toIsoWithOffset(d, t, tzOffset);
      const endAt = addMinutesToIso(startAt, durationMinutes);
      slots.push({ startAt, endAt });
    }
    return { date: d, slots };
  });
}

function isV2TimesShape(json: Record<string, unknown>): boolean {
  const raw = json.slots;
  if (!Array.isArray(raw) || raw.length === 0) return false;
  const first = raw[0];
  return Boolean(first && typeof first === "object" && "times" in first && Array.isArray((first as { times: unknown }).times));
}

export function createBookingSyncPort(): BookingSyncPort {
  return {
    async fetchSlots(query: BookingSlotsIntegratorQuery): Promise<BookingSlotsByDate[]> {
      let body: Record<string, unknown>;
      if (query.version === "v2") {
        const payload: Record<string, unknown> = {
          version: "v2",
          rubitimeBranchId: query.rubitimeBranchId,
          rubitimeCooperatorId: query.rubitimeCooperatorId,
          rubitimeServiceId: query.rubitimeServiceId,
          slotDurationMinutes: query.slotDurationMinutes,
        };
        if (query.date) {
          payload.dateFrom = query.date;
          payload.dateTo = query.date;
        }
        body = payload;
      } else {
        body = {
          type: query.type,
          city: query.city,
          category: query.category,
          date: query.date,
        };
      }

      const { status, json } = await postSignedWithRetry("/api/bersoncare/rubitime/slots", body);
      if (status >= 400 || json.ok !== true) {
        throw new Error(integratorErrorCode(json));
      }

      if (query.version === "v2") {
        if (isV2TimesShape(json)) {
          return normalizeV2SlotsPayload(json.slots, query.slotDurationMinutes, DEFAULT_SLOT_TZ);
        }
        return validateV1SlotsContract(json);
      }
      if (isV2TimesShape(json)) {
        return normalizeV2SlotsPayload(json.slots, 60, DEFAULT_SLOT_TZ);
      }
      return validateV1SlotsContract(json);
    },

    async createRecord(input: CreateBookingSyncInput): Promise<{ rubitimeId: string | null; raw: Record<string, unknown> }> {
      let body: Record<string, unknown>;
      if (input.version === "v2") {
        body = {
          version: "v2",
          rubitimeBranchId: input.rubitimeBranchId,
          rubitimeCooperatorId: input.rubitimeCooperatorId,
          rubitimeServiceId: input.rubitimeServiceId,
          slotStart: input.slotStart,
          patient: {
            name: input.contactName,
            phone: input.contactPhone,
            ...(input.contactEmail ? { email: input.contactEmail } : {}),
          },
          localBookingId: input.localBookingId,
        };
      } else {
        body = {
          type: input.type,
          city: input.city,
          category: input.category,
          slotStart: input.slotStart,
          slotEnd: input.slotEnd,
          contactName: input.contactName,
          contactPhone: input.contactPhone,
          contactEmail: input.contactEmail,
        };
      }

      const { status, json } = await postSignedWithRetry("/api/bersoncare/rubitime/create-record", body);
      if (status >= 400 || json.ok !== true) {
        throw new Error(integratorErrorCode(json));
      }
      const rubitimeIdValue = json.rubitimeRecordId ?? json.recordId;
      const rubitimeId = typeof rubitimeIdValue === "string" && rubitimeIdValue.trim()
        ? rubitimeIdValue.trim()
        : null;
      return { rubitimeId, raw: json };
    },

    async cancelRecord(rubitimeId: string): Promise<void> {
      const { status, json } = await postSignedWithRetry("/api/bersoncare/rubitime/remove-record", {
        recordId: rubitimeId,
      });
      if (status >= 400 || json.ok !== true) {
        throw new Error("rubitime_cancel_failed");
      }
    },

    async emitBookingEvent(input): Promise<void> {
      const { status, json } = await postSignedWithRetry("/api/bersoncare/rubitime/booking-event", {
        eventType: input.eventType,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload,
      });
      if (status >= 400 || json.ok !== true) {
        throw new Error("booking_event_failed");
      }
    },
  };
}
