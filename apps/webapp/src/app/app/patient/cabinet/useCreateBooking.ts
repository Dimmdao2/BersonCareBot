"use client";

import { useState } from "react";
import type { BookingSelection } from "./useBookingSelection";
import type { BookingSlot } from "@/modules/patient-booking/types";

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
      const res = await fetch("/api/booking/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: input.selection.type,
          city: input.selection.city,
          category: input.selection.category,
          slotStart: input.slot.startAt,
          slotEnd: input.slot.endAt,
          contactName: input.contactName,
          contactPhone: input.contactPhone,
          contactEmail: input.contactEmail,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok !== true) {
        setError(json.error ?? "Не удалось создать запись");
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
