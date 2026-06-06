"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { routePaths } from "@/app-layer/routes/paths";
import type { PatientBookingPartialOutcome } from "@/modules/patient-booking/types";
import {
  parsePatientBookingPartialOutcome,
} from "@/shared/booking/bookingPartialOutcomeToast";
import { redirectIfPatientActivationRequired } from "./bookingPatientActivation";

export type RescheduleBookingResult =
  | { ok: true; partial?: PatientBookingPartialOutcome }
  | { ok: false };

const ERROR_RU: Record<string, string> = {
  not_found: "Запись не найдена",
  no_canonical: "Перенос недоступен для этой записи",
  too_late: "Срок самостоятельного переноса истёк",
  limit_exceeded: "Лимит переносов исчерпан",
  change_not_allowed: "Такой перенос не разрешён",
  staff_confirmation_required: "Нужно согласование специалиста",
  slot_overlap: "Это время уже занято",
  sync_failed: "Не удалось обновить запись",
};

export function mapRescheduleErrorCodeToRu(code: string | undefined): string {
  if (!code) return "Не удалось перенести запись";
  return ERROR_RU[code] ?? "Не удалось перенести запись";
}

export function useRescheduleBooking() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rescheduleBooking(input: {
    bookingId: string;
    slotStart: string;
    slotEnd: string;
    reason?: string;
  }): Promise<RescheduleBookingResult> {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/booking/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
        ok?: boolean;
        error?: string;
        redirectTo?: string;
      };
      if (!res.ok || json.ok !== true) {
        if (redirectIfPatientActivationRequired(json, router)) {
          setError(null);
          return { ok: false };
        }
        setError(mapRescheduleErrorCodeToRu(json.error));
        return { ok: false };
      }
      return { ok: true, partial: parsePatientBookingPartialOutcome(json) };
    } catch {
      setError("Ошибка сети при переносе");
      return { ok: false };
    } finally {
      setSubmitting(false);
    }
  }

  return {
    submitting,
    error,
    rescheduleBooking,
    successRedirectPath: routePaths.cabinet,
  };
}
