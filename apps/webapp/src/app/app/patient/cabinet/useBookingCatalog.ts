"use client";

import { useCallback, useEffect, useState } from "react";

export type CatalogCity = { id: string; code: string; title: string };

export type CatalogBranchService = {
  id: string;
  service?: { title: string; durationMinutes: number } | null;
};

type CitiesState = { loading: boolean; error: string | null; cities: CatalogCity[] };

export function useBookingCatalogCities(open: boolean) {
  const [state, setState] = useState<CitiesState>({ loading: false, error: null, cities: [] });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch("/api/booking/catalog/cities", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        cities?: CatalogCity[];
        error?: string;
      };
      if (!res.ok || json.ok !== true) {
        setState({ loading: false, error: json.error ?? "Не удалось загрузить города", cities: [] });
        return;
      }
      setState({ loading: false, error: null, cities: Array.isArray(json.cities) ? json.cities : [] });
    } catch {
      setState({ loading: false, error: "Ошибка сети", cities: [] });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [open, load]);

  return { ...state, reload: load };
}

type ServicesState = { loading: boolean; error: string | null; services: CatalogBranchService[] };

export function useBookingCatalogServices(cityCode: string | null, open: boolean) {
  const [state, setState] = useState<ServicesState>({ loading: false, error: null, services: [] });

  const load = useCallback(async () => {
    if (!cityCode) {
      setState({ loading: false, error: null, services: [] });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const params = new URLSearchParams({ cityCode });
      const res = await fetch(`/api/booking/catalog/services?${params}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        services?: CatalogBranchService[];
        error?: string;
      };
      if (!res.ok || json.ok !== true) {
        setState({ loading: false, error: json.error ?? "Не удалось загрузить услуги", services: [] });
        return;
      }
      setState({ loading: false, error: null, services: Array.isArray(json.services) ? json.services : [] });
    } catch {
      setState({ loading: false, error: "Ошибка сети", services: [] });
    }
  }, [cityCode]);

  useEffect(() => {
    if (!open || !cityCode) return;
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [open, cityCode, load]);

  return { ...state, reload: load };
}
