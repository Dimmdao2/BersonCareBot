"use client";

import { useState } from "react";
import type { BookingSelection } from "@/app/app/patient/cabinet/useBookingSelection";
import type { BookingSlot, PatientBookingRecord } from "@/modules/patient-booking/types";
import type { BookingAttribution } from "@/modules/booking-attribution/types";
import { mapBookingCreateErrorCodeToRu } from "@/app/app/patient/cabinet/bookingCreateErrorMessages";
import { readStoredPublicBookingAttribution } from "./attributionStorage";

type FormAnswer = { fieldKey: string; value: string };

type CreateBookingInput = {
  selection: BookingSelection;
  slot: BookingSlot;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  formAnswers?: FormAnswer[];
};

export function usePublicCreateBooking() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createBooking(input: CreateBookingInput): Promise<PatientBookingRecord | false> {
    setSubmitting(true);
    setError(null);
    try {
      const attribution: BookingAttribution = readStoredPublicBookingAttribution();
      const body =
        input.selection.type === "online"
          ? {
              type: "online" as const,
              category: input.selection.category,
              slotStart: input.slot.startAt,
              slotEnd: input.slot.endAt,
              contactName: input.contactName,
              contactPhone: input.contactPhone,
              contactEmail: input.contactEmail,
              formAnswers: input.formAnswers,
              attribution,
            }
          : (() => {
              const inPerson =
                input.selection.branchId && input.selection.serviceId
                  ? {
                      branchId: input.selection.branchId,
                      serviceId: input.selection.serviceId,
                    }
                  : { branchServiceId: input.selection.branchServiceId };
              return {
                type: "in_person" as const,
                ...inPerson,
                cityCode: input.selection.cityCode,
                slotStart: input.slot.startAt,
                slotEnd: input.slot.endAt,
                contactName: input.contactName,
                contactPhone: input.contactPhone,
                contactEmail: input.contactEmail,
                formAnswers: input.formAnswers,
                attribution,
              };
            })();

      const res = await fetch("/api/booking/public/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        retryAfterSeconds?: number;
        booking?: PatientBookingRecord;
      };
      if (!res.ok || json.ok !== true || !json.booking) {
        if (json.error === "rate_limited") {
          setError("Слишком много попыток. Попробуйте позже.");
        } else {
          setError(mapBookingCreateErrorCodeToRu(json.error));
        }
        return false;
      }
      return json.booking;
    } catch {
      setError("Ошибка сети при создании записи");
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  return { submitting, error, createBooking };
}
