'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { Switch } from '@/shared/ui/doctor/primitives/switch';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import {
  SOLO_BOOKING_UNAVAILABLE_MESSAGE,
  ensureDefaultSpecialist,
  fetchSoloOverview,
  isServiceAvailableAtLocation,
  setServiceLocationAvailability,
  type SoloOverview,
} from '@/app/app/settings/bookingSoloAdminApi';
import { isBuiltInOnlineLocation } from '@/modules/booking-engine/onlineLocation';

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
      setLoadError(e instanceof Error ? e.message : 'load_failed');
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  const activeBranches = useMemo(() => {
    const branches = (overview?.branches ?? []).filter((branch) => branch.isActive);
    return branches.sort((left, right) => {
      const leftIsOnline = isBuiltInOnlineLocation(left);
      const rightIsOnline = isBuiltInOnlineLocation(right);
      if (leftIsOnline !== rightIsOnline) return leftIsOnline ? 1 : -1;
      return left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, 'ru');
    });
  }, [overview?.branches]);
  const activeServices = useMemo(
    () =>
      (overview?.services ?? [])
        .filter((service) => service.isActive)
        .sort(
          (left, right) =>
            left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, 'ru'),
        ),
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
        setActionError(e instanceof Error ? e.message : 'toggle_failed');
      }
    });
  }

  if (unavailable) {
    return <p className="text-sm text-muted-foreground">{SOLO_BOOKING_UNAVAILABLE_MESSAGE}</p>;
  }

  if (!overview) {
    return loadError ? <p className="text-sm text-destructive">{loadError}</p> : null;
  }

  if (activeBranches.length === 0 || activeServices.length === 0) {
    return (
      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Доступность услуг по филиалам</DoctorSectionTitle>
        </DoctorSectionHeader>
        <p className="text-sm text-muted-foreground">Сначала добавьте активные филиалы и услуги.</p>
      </DoctorSection>
    );
  }

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Доступность услуг по филиалам</DoctorSectionTitle>
      </DoctorSectionHeader>
      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
      {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}

      <div className="overflow-hidden rounded-md border">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col />
            {activeBranches.map((branch) => (
              <col key={branch.id} className="w-20 sm:w-24" />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="px-3 py-2 font-medium">Услуга</th>
              {activeBranches.map((branch) => {
                const compactTitle = (branch.shortTitle?.trim() || branch.title).slice(0, 10);
                return (
                  <th
                    key={branch.id}
                    className="truncate px-2 py-2 text-center font-medium"
                    title={branch.title}
                  >
                    {compactTitle}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {activeServices.map((service) => (
              <tr key={service.id} className="border-b border-border/60 last:border-0">
                <td className="max-w-0 truncate px-3 py-2" title={service.title}>
                  {service.title}
                </td>
                {activeBranches.map((branch) => {
                  const enabled = isServiceAvailableAtLocation(overview, service.id, branch.id);
                  return (
                    <td key={branch.id} className="px-2 py-2 text-center">
                      <Switch
                        checked={enabled}
                        disabled={pending}
                        aria-label={`${service.title} — ${branch.title}`}
                        onCheckedChange={(checked) => toggle(service.id, branch.id, checked)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DoctorSection>
  );
}
