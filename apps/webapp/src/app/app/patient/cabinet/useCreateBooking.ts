"use client";

import { useState } from "react";
import type { BookingSelection } from "./useBookingSelection";
import type { BookingSlot } from "@/modules/patient-booking/types";
import { mapBookingCreateErrorCodeToRu } from "./bookingCreateErrorMessages";

type CreateBookingInput = {
  selection: BookingSelection;
  slot: BookingSlot;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
};

export function useCreateBooking() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createBooking(input: CreateBookingInput): Promise<boolean> {
    setSubmitting(true);
    setError(null);
    try {
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
            }
          : {
              type: "in_person" as const,
              branchServiceId: input.selection.branchServiceId,
              cityCode: input.selection.cityCode,
              slotStart: input.slot.startAt,
              slotEnd: input.slot.endAt,
              contactName: input.contactName,
              contactPhone: input.contactPhone,
              contactEmail: input.contactEmail,
            };

      const res = await fetch("/api/booking/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok !== true) {
        setError(mapBookingCreateErrorCodeToRu(json.error));
        return false;
      }
      return true;
    } catch {
      setError("Ошибка сети при создании записи");
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  return {
    submitting,
    error,
    createBooking,
  };
}
