import { createHmac } from "node:crypto";
import { getIntegratorApiUrl, getIntegratorWebhookSecret } from "@/modules/system-settings/integrationRuntime";
import type { BookingSlotsByDate } from "@/modules/patient-booking/types";
import type { BookingSlotsQuery, BookingSyncPort, CreateBookingSyncInput } from "@/modules/patient-booking/ports";

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

/**
 * Проверяет, что integrator вернул корректный контракт слотов.
 * Integrator отвечает за нормализацию raw Rubitime response;
 * webapp только валидирует что `slots` — массив.
 * Если integrator вернул ok: true, но slots не массив — это ошибка integrator contract.
 */
function validateSlotsContract(json: Record<string, unknown>): BookingSlotsByDate[] {
  const raw = json.slots;
  if (!Array.isArray(raw)) {
    throw new Error("rubitime_slots_contract_broken: slots is not an array in integrator response");
  }
  return raw as BookingSlotsByDate[];
}

export function createBookingSyncPort(): BookingSyncPort {
  return {
    async fetchSlots(query: BookingSlotsQuery): Promise<BookingSlotsByDate[]> {
      const { status, json } = await postSigned("/api/bersoncare/rubitime/slots", {
        type: query.type,
        city: query.city,
        category: query.category,
        date: query.date,
      });
      if (status >= 400 || json.ok !== true) {
        const error = typeof json.error === "string" ? json.error : "rubitime_slots_failed";
        throw new Error(error);
      }
      return validateSlotsContract(json);
    },

    async createRecord(input: CreateBookingSyncInput): Promise<{ rubitimeId: string | null; raw: Record<string, unknown> }> {
      const { status, json } = await postSigned("/api/bersoncare/rubitime/create-record", {
        type: input.type,
        city: input.city,
        category: input.category,
        slotStart: input.slotStart,
        slotEnd: input.slotEnd,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
      });
      if (status >= 400 || json.ok !== true) {
        throw new Error("rubitime_create_failed");
      }
      const rubitimeIdValue = json.recordId;
      const rubitimeId = typeof rubitimeIdValue === "string" && rubitimeIdValue.trim()
        ? rubitimeIdValue.trim()
        : null;
      return { rubitimeId, raw: json };
    },

    async cancelRecord(rubitimeId: string): Promise<void> {
      const { status, json } = await postSigned("/api/bersoncare/rubitime/remove-record", {
        recordId: rubitimeId,
      });
      if (status >= 400 || json.ok !== true) {
        throw new Error("rubitime_cancel_failed");
      }
    },

    async emitBookingEvent(input): Promise<void> {
      const { status, json } = await postSigned("/api/bersoncare/rubitime/booking-event", {
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
