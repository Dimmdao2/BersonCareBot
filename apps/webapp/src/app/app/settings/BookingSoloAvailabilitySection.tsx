"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  ensureDefaultSpecialist,
  fetchSoloOverview,
  isServiceAvailableAtLocation,
  setServiceLocationAvailability,
  type SoloOverview,
} from "@/app/app/settings/bookingSoloAdminApi";

export function BookingSoloAvailabilitySection() {
  const [overview, setOverview] = useState<SoloOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    setLoadError(null);
    setUnavailable(false);
    try {
      const data = await fetchSoloOverview();
      if (!data) {
        setUnavailable(true);
        return;
      }
      setOverview(data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "load_failed");
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  const activeBranches = useMemo(
    () => (overview?.branches ?? []).filter((b) => b.isActive),
    [overview?.branches],
  );
  const activeServices = useMemo(
    () => (overview?.services ?? []).filter((s) => s.isActive),
    [overview?.services],
  );

  function toggle(serviceId: string, branchId: string, enabled: boolean) {
    if (!overview) return;
    setActionError(null);
    startTransition(async () => {
      try {
        const specialistId = await ensureDefaultSpecialist(overview.organization?.title);
        await setServiceLocationAvailability(serviceId, branchId, enabled, specialistId);
        await load();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "toggle_failed");
      }
    });
  }

  if (unavailable) {
    return (
      <p className="text-sm text-muted-foreground">Каноническая запись недоступна без подключения к БД.</p>
    );
  }

  if (!overview) {
    return loadError ? <p className="text-sm text-destructive">{loadError}</p> : null;
  }

  if (activeBranches.length === 0 || activeServices.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Доступность</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Сначала добавьте активные локации и услуги.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Доступность услуг по локациям</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
        {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="px-3 py-2 font-medium">Услуга</th>
                {activeBranches.map((b) => (
                  <th key={b.id} className="px-3 py-2 font-medium text-center">
                    {b.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeServices.map((s) => (
                <tr key={s.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2">{s.title}</td>
                  {activeBranches.map((b) => {
                    const on = isServiceAvailableAtLocation(overview, s.id, b.id);
                    return (
                      <td key={b.id} className="px-3 py-2 text-center">
                        <Switch
                          checked={on}
                          disabled={pending}
                          aria-label={`${s.title} — ${b.title}`}
                          onCheckedChange={(checked) => toggle(s.id, b.id, checked)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
