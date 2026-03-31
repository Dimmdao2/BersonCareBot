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

export function useBookingSlots(selection: BookingSelection | null) {
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
