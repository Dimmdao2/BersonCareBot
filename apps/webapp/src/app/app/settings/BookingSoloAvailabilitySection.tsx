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
  pickDefaultSpecialist,
  fetchSoloOverview,
  isServiceAvailableAtLocation,
  setSpecialistServiceAtBranch,
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
        // Специалиста заводит регистрация (`app.provision_specialist_owner`) или приглашение
        // администратором — больше нигде и никогда. Галка только пишет строку на уже
        // существующего; нет его — организация сломана, и молча лепить нового нельзя.
        const specialist = pickDefaultSpecialist(overview.specialists);
        if (!specialist) {
          setActionError('specialist_missing');
          return;
        }
        await setSpecialistServiceAtBranch(serviceId, branchId, enabled, specialist.id);
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
      {/* Новая услуга приезжает сюда уже включённой во всех активных филиалах (#1102 §1.1); экран
          нужен только чтобы СУЗИТЬ — убрать услугу из филиала, где её не делают. */}
      <p className="text-sm text-muted-foreground">
        Новые услуги доступны во всех ваших локациях. Снимите переключатель там, где услугу не
        оказываете.
      </p>
      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
      {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}

      <div className="overflow-hidden rounded-md border md:hidden">
        {activeServices.map((service) => (
          <div key={service.id} className="border-b border-border/60 px-3 py-2.5 last:border-0">
            <p className="mb-2 break-words text-sm text-foreground">{service.title}</p>
            <div
              className="grid gap-x-1.5 gap-y-2"
              style={{
                gridTemplateColumns: `repeat(${activeBranches.length}, minmax(0, 1fr))`,
              }}
            >
              {activeBranches.map((branch) => {
                const enabled = isServiceAvailableAtLocation(overview, service.id, branch.id);
                const compactTitle = (branch.shortTitle?.trim() || branch.title).slice(0, 10);
                return (
                  <div key={branch.id} className="flex min-w-0 flex-col items-center gap-1">
                    <span
                      className="w-full truncate text-center text-xs text-muted-foreground"
                      title={branch.title}
                    >
                      {compactTitle}
                    </span>
                    <Switch
                      checked={enabled}
                      disabled={pending}
                      aria-label={`${service.title} — ${branch.title}`}
                      onCheckedChange={(checked) => toggle(service.id, branch.id, checked)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-md border md:block">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col />
            {activeBranches.map((branch) => (
              <col key={branch.id} className="w-16 lg:w-20" />
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
                    className="truncate px-1 py-2 text-center font-medium"
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
                    <td key={branch.id} className="px-1 py-2 text-center">
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
