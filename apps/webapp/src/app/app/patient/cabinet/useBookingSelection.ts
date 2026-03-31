"use client";

import { useState } from "react";
import type { BookingCategory, BookingType } from "@/modules/patient-booking/types";

export type BookingSelection = {
  type: BookingType;
  city?: string;
  category: BookingCategory;
};

export function useBookingSelection() {
  const [selection, setSelection] = useState<BookingSelection | null>(null);

  return {
    selection,
    selectInPerson(city: "moscow" | "spb") {
      setSelection({
        type: "in_person",
        city,
        category: "general",
      });
    },
    selectOnline(category: "rehab_lfk" | "nutrition") {
      setSelection({
        type: "online",
        category,
      });
    },
    clear() {
      setSelection(null);
    },
  };
}
