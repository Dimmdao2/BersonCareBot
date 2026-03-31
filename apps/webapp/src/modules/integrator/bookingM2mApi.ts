import { createHmac } from "node:crypto";
import { env, integratorWebhookSecret } from "@/config/env";
import type { BookingSlotsByDate } from "@/modules/patient-booking/types";
import type { BookingSlotsQuery, BookingSyncPort, CreateBookingSyncInput } from "@/modules/patient-booking/ports";

function normalizeBaseUrl(): string | null {
  const base = env.INTEGRATOR_API_URL?.trim();
  if (!base) return null;
  return base.replace(/\/$/, "");
}

function signBody(timestamp: string, rawBody: string): string {
  return createHmac("sha256", integratorWebhookSecret()).update(`${timestamp}.${rawBody}`).digest("base64url");
}

async function postSigned(path: string, body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> {
  const base = normalizeBaseUrl();
  const secret = integratorWebhookSecret();
  if (!base || !secret) {
    throw new Error("integrator_not_configured");
  }
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signBody(timestamp, raw);
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

function normalizeSlots(json: Record<string, unknown>): BookingSlotsByDate[] {
  const raw = json.slots;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (typeof row !== "object" || row === null) return null;
      const date = (row as Record<string, unknown>).date;
      const slots = (row as Record<string, unknown>).slots;
      if (typeof date !== "string" || !Array.isArray(slots)) return null;
      const normalizedSlots = slots
        .map((slot) => {
          if (typeof slot !== "object" || slot === null) return null;
          const startAt = (slot as Record<string, unknown>).startAt;
          const endAt = (slot as Record<string, unknown>).endAt;
          if (typeof startAt !== "string" || typeof endAt !== "string") return null;
          return { startAt, endAt };
        })
        .filter((slot): slot is { startAt: string; endAt: string } => slot !== null);
      return { date, slots: normalizedSlots };
    })
    .filter((row): row is BookingSlotsByDate => row !== null);
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
        throw new Error("rubitime_slots_failed");
      }
      return normalizeSlots(json);
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
