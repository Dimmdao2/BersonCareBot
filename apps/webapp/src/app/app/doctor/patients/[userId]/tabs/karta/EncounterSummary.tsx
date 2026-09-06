'use client';

/**
 * ENCOUNTERS-01/02/03 — «Приёмы: N» summary section on the patient «Карта» tab.
 *
 * N is the count of real clinical visits (`Visit[]`, from `listVisits` / `/clinical`),
 * never calendar appointments. Footer carries the two encounter actions; there is no
 * permanent second history column/panel on this tab any more (history lives one modal
 * layer away — see `EncounterHistoryModal`).
 */
import Link from 'next/link';
import type { Visit } from '@/modules/patient-clinical/ports';
import { Button, buttonVariants } from '@/shared/ui/doctor/primitives/button';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import {
  doctorInlineLinkClass,
  doctorSectionCardClass,
  doctorSectionTitleClass,
} from '@/shared/ui/doctor/doctorVisual';

export function EncounterSummary({
  visits,
  loading,
  fetchError,
  newEncounterHref,
  onOpenHistory,
  onOpenVisit,
}: {
  visits: Visit[];
  loading: boolean;
  fetchError: boolean;
  /** Canonical full-page encounter editor route (ENCOUNTERS-05). */
  newEncounterHref: string;
  onOpenHistory: () => void;
  onOpenVisit: (visitId: string) => void;
}) {
  // listVisits() orders newest-first — visits[0] is the previous encounter.
  const previousVisit = visits[0] ?? null;
  const primaryCount = visits.filter((v) => v.type === 'first').length;
  const repeatCount = visits.filter((v) => v.type === 'repeat').length;

  return (
    <section className={doctorSectionCardClass}>
      <h3 className={doctorSectionTitleClass}>Приёмы: {loading ? '…' : visits.length}</h3>

      {loading ? <DoctorPanelLoading className="py-3" /> : null}
      {!loading && fetchError ? (
        <p className="text-sm text-destructive">Не удалось загрузить приёмы.</p>
      ) : null}
      {!loading && !fetchError ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground">
            <span>
              Первичных: <b>{primaryCount}</b>
            </span>
            <span>
              Повторных: <b>{repeatCount}</b>
            </span>
          </div>
          {previousVisit ? (
            <button
              type="button"
              onClick={() => onOpenVisit(previousVisit.id)}
              className={`self-start text-sm ${doctorInlineLinkClass}`}
            >
              Предыдущий приём: {previousVisit.date}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onOpenHistory}>
          История приёмов
        </Button>
        <Link href={newEncounterHref} className={buttonVariants({ size: 'sm' })}>
          Новый приём
        </Link>
      </div>
    </section>
  );
}
