"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BookingSelection } from "./useBookingSelection";
import type { BookingSlot, BookingSlotsByDate } from "@/modules/patient-booking/types";

type State = {
  loading: boolean;
  error: string | null;
  data: BookingSlotsByDate[];
};

function buildQuery(selection: BookingSelection, date?: string): string {
  const params = new URLSearchParams();
  params.set("type", selection.type);
  params.set("category", selection.category);
  if (selection.city) params.set("city", selection.city);
  if (date) params.set("date", date);
  return params.toString();
}

export function useBookingSlots(selection: BookingSelection | null, selectedDate: string | null) {
  const [state, setState] = useState<State>({
    loading: false,
    error: null,
    data: [],
  });

  const query = useMemo(() => {
    if (!selection) return null;
    return buildQuery(selection, selectedDate ?? undefined);
  }, [selection, selectedDate]);

  const load = useCallback(async () => {
    if (!query) {
      setState({ loading: false, error: null, data: [] });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch(`/api/booking/slots?${query}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; slots?: BookingSlotsByDate[]; error?: string };
      if (!res.ok || json.ok !== true) {
        setState({ loading: false, error: json.error ?? "Не удалось загрузить слоты", data: [] });
        return;
      }
      setState({
        loading: false,
        error: null,
        data: Array.isArray(json.slots) ? json.slots : [],
      });
    } catch {
      setState({ loading: false, error: "Ошибка сети при загрузке слотов", data: [] });
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const availableDates = useMemo(() => state.data.map((row) => row.date), [state.data]);

  const slotsForSelectedDate = useMemo<BookingSlot[]>(() => {
    if (!selectedDate) return [];
    const row = state.data.find((x) => x.date === selectedDate);
    return row?.slots ?? [];
  }, [selectedDate, state.data]);

  return {
    ...state,
    availableDates,
    slotsForSelectedDate,
    reload: load,
  };
}
