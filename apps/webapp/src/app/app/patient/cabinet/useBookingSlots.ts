"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { redirectIfPatientActivationRequired } from "./bookingPatientActivation";
import type { BookingSelection } from "./useBookingSelection";
import type { BookingSlot, BookingSlotsByDate } from "@/modules/patient-booking/types";
import { mapBookingSlotsErrorCodeToRu } from "./bookingSlotsErrorMessages";

type State = {
  loading: boolean;
  error: string | null;
  data: BookingSlotsByDate[];
};

function buildQuery(selection: BookingSelection, date?: string): string {
  const params = new URLSearchParams();
  if (selection.type === "online") {
    params.set("type", "online");
    params.set("category", selection.category);
  } else {
    params.set("type", "in_person");
    params.set("branchServiceId", selection.branchServiceId);
  }
  if (date) params.set("date", date);
  return params.toString();
}

export function useBookingSlots(selection: BookingSelection | null) {
  const router = useRouter();
  const [state, setState] = useState<State>({
    loading: false,
    error: null,
    data: [],
  });

  const query = useMemo(() => {
    if (!selection) return null;
    return buildQuery(selection, undefined);
  }, [selection]);

  const load = useCallback(async () => {
    if (!query) {
      setState({ loading: false, error: null, data: [] });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch(`/api/booking/slots?${query}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        slots?: BookingSlotsByDate[];
        error?: string;
        redirectTo?: string;
      };
      if (!res.ok || json.ok !== true) {
        if (redirectIfPatientActivationRequired(json, router)) {
          setState({ loading: false, error: null, data: [] });
          return;
        }
        setState({ loading: false, error: mapBookingSlotsErrorCodeToRu(json.error), data: [] });
        return;
      }
      setState({
        loading: false,
        error: null,
        data: Array.isArray(json.slots) ? json.slots : [],
      });
    } catch {
      setState({ loading: false, error: "Ошибка сети при загрузке расписания.", data: [] });
    }
  }, [query, router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const availableDates = useMemo(() => state.data.map((row) => row.date), [state.data]);

  const slotsForDate = useCallback((selectedDate: string | null): BookingSlot[] => {
    if (!selectedDate) return [];
    const row = state.data.find((x) => x.date === selectedDate);
    return row?.slots ?? [];
  }, [state.data]);

  return {
    ...state,
    availableDates,
    slotsForDate,
    reload: load,
  };
}
