import { createHmac } from "node:crypto";
import { getIntegratorApiUrl, getIntegratorWebhookSecret } from "@/modules/system-settings/integrationRuntime";
import type { BookingSlotsByDate } from "@/modules/patient-booking/types";
import type {
  BookingSlotsIntegratorQuery,
  BookingSyncPort,
  CreateBookingSyncInput,
} from "@/modules/patient-booking/ports";

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
const BOOKING_PROVIDER_RETIRED_ERROR = "booking_provider_retired";

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
  return "booking_lifecycle_event_failed";
}

async function failRetiredProvider<T>(_input?: unknown): Promise<T> {
  throw new Error(BOOKING_PROVIDER_RETIRED_ERROR);
}

export function createBookingSyncPort(): BookingSyncPort {
  return {
    fetchSlots(_query: BookingSlotsIntegratorQuery): Promise<BookingSlotsByDate[]> {
      return failRetiredProvider();
    },

    createRecord(_input: CreateBookingSyncInput): Promise<{ rubitimeId: string | null; raw: Record<string, unknown> }> {
      return failRetiredProvider();
    },

    cancelRecord(_externalRecordId: string): Promise<void> {
      return failRetiredProvider();
    },

    deleteRecord(_externalRecordId: string): Promise<void> {
      return failRetiredProvider();
    },

    updateRecord(_input: {
      rubitimeId: string;
      slotStart: string;
      slotEnd?: string;
      rubitimePatch?: Record<string, unknown>;
    }): Promise<void> {
      return failRetiredProvider();
    },

    async emitBookingEvent(input): Promise<void> {
      const { status, json } = await postSignedWithRetry("/api/bersoncare/booking/lifecycle-event", {
        eventType: input.eventType,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload,
      });
      if (status >= 400 || json.ok !== true) {
        throw new Error(integratorErrorCode(json));
      }
    },
  };
}
