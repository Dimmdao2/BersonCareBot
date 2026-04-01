"use client";

import { useState } from "react";
import type { BookingCategory } from "@/modules/patient-booking/types";

export type BookingSelection =
  | { type: "online"; category: BookingCategory }
  | {
      type: "in_person";
      cityCode: string;
      cityTitle: string;
      branchServiceId: string;
      serviceTitle: string;
    };

export type InPersonDraft = {
  cityCode: string;
  cityTitle: string;
} | null;

export function useBookingSelection() {
  const [selection, setSelection] = useState<BookingSelection | null>(null);
  /** After user chose «Очный», before service — which city is selected. */
  const [inPersonDraft, setInPersonDraft] = useState<InPersonDraft>(null);
  /** User clicked «Очный приём» and is picking city → service. */
  const [inPersonMode, setInPersonMode] = useState(false);

  return {
    selection,
    inPersonDraft,
    inPersonMode,
    selectOnline(category: "rehab_lfk" | "nutrition") {
      setInPersonMode(false);
      setInPersonDraft(null);
      setSelection({ type: "online", category });
    },
    startInPerson() {
      setInPersonMode(true);
      setSelection(null);
      setInPersonDraft(null);
    },
    selectInPersonCity(cityCode: string, cityTitle: string) {
      setSelection(null);
      setInPersonDraft({ cityCode, cityTitle });
    },
    selectInPersonService(branchServiceId: string, serviceTitle: string) {
      if (!inPersonDraft) return;
      const { cityCode, cityTitle } = inPersonDraft;
      setInPersonDraft(null);
      setSelection({
        type: "in_person",
        cityCode,
        cityTitle,
        branchServiceId,
        serviceTitle,
      });
    },
    clear() {
      setSelection(null);
      setInPersonDraft(null);
      setInPersonMode(false);
    },
  };
}
