'use client';

/**
 * Панель «Обзор и записи» в чате врача (#814): открывается ПОВЕРХ левой колонки списка
 * диалогов (сам чат остаётся виден справа), закрывается по ×. Визуальный chrome — тот же
 * стандартный левый блок каталога, что и на странице «Упражнения» (`CatalogLeftPane`), не
 * самописный контейнер (doctor-ui-shared-primitives canon).
 *
 * v1: активные записи + история записи — тот же источник данных, что и карточка клиента
 * (`/api/doctor/clients/:userId/history`, тот же `deps.clientHistory`/booking-engine слой,
 * без нового эндпоинта).
 *
 * Extension points (НЕ строим сейчас, только секции-заглушки):
 *  - «Обзор» — абонемент, симптомы и диагнозы.
 *  - «Статистика программы» — краткая статистика по программе реабилитации.
 */

import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { CatalogLeftPane } from '@/shared/ui/doctor/catalog/CatalogLeftPane';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
import { Badge } from '@/shared/ui/doctor/primitives/badge';
import { doctorSectionTitleClass } from '@/shared/ui/doctor/doctorVisual';
import { appointmentStatusLabel } from '@/modules/client-history/labels';
import { splitVisitsByActivity } from '@/modules/client-history/clientHistoryUtils';
import type { ClientVisitHistoryRow } from '@/modules/client-history/types';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';

type Props = {
  /** Платформенный userId пациента за диалогом (см. `patientUserId` в /api/doctor/messages/conversations). */
  patientUserId: string;
  patientDisplayName: string;
  onClose: () => void;
};

const SECTION_CLASS = 'border-b border-border pb-3 last:border-b-0 last:pb-0';

function formatVisitWhen(startAt: string): string {
  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function VisitRowItem({ visit }: { visit: ClientVisitHistoryRow }) {
  return (
    <li className="rounded-md border border-border p-2 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-medium">{visit.serviceTitle ?? 'Запись'}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatVisitWhen(visit.startAt)}
        </span>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Badge variant="outline">{appointmentStatusLabel(visit.status)}</Badge>
        {visit.specialistName ? <span className="truncate">{visit.specialistName}</span> : null}
      </p>
    </li>
  );
}

function VisitList({ visits }: { visits: ClientVisitHistoryRow[] }) {
  return (
    <ul className="mt-1.5 flex list-none flex-col gap-1.5 p-0">
      {visits.map((v) => (
        <VisitRowItem key={v.appointmentId} visit={v} />
      ))}
    </ul>
  );
}

export function ChatClientOverviewPanel({ patientUserId, patientDisplayName, onClose }: Props) {
  const [visits, setVisits] = useState<ClientVisitHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctor/clients/${encodeURIComponent(patientUserId)}/history`);
      const json = (await res.json()) as { ok?: boolean; visits?: ClientVisitHistoryRow[] };
      if (!res.ok || !json.ok) {
        setError('Не удалось загрузить записи');
        setVisits([]);
        return;
      }
      setVisits(json.visits ?? []);
    } catch {
      setError('Не удалось загрузить записи');
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }, [patientUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const { active, history } = splitVisitsByActivity(visits);

  return (
    <CatalogLeftPane
      stickySplit={false}
      className="absolute inset-0 z-10"
      headerSlot={
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className={doctorSectionTitleClass}>Обзор и записи</p>
            <p className="truncate text-xs text-muted-foreground">{patientDisplayName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть обзор и записи"
            className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-1">
        {/* Extension point (не строим сейчас): абонемент, симптомы и диагнозы. */}
        <section className={SECTION_CLASS} aria-labelledby="chat-overview-quick-heading">
          <h3 id="chat-overview-quick-heading" className={doctorSectionTitleClass}>
            Обзор
          </h3>
          <DoctorEmptyState size="xs" className="mt-1.5">
            <span>Абонемент, симптомы и диагнозы — в следующей итерации</span>
          </DoctorEmptyState>
        </section>

        <section className={SECTION_CLASS} aria-labelledby="chat-overview-active-heading">
          <h3 id="chat-overview-active-heading" className={doctorSectionTitleClass}>
            Активные записи
          </h3>
          {loading ? (
            <DoctorPanelLoading className="mt-1.5 py-6" />
          ) : error ? (
            <p className="mt-1.5 text-sm text-destructive">{error}</p>
          ) : active.length === 0 ? (
            <DoctorEmptyState size="xs" className="mt-1.5">
              <span>Нет активных записей</span>
            </DoctorEmptyState>
          ) : (
            <VisitList visits={active} />
          )}
        </section>

        <section className={SECTION_CLASS} aria-labelledby="chat-overview-history-heading">
          <h3 id="chat-overview-history-heading" className={doctorSectionTitleClass}>
            История записи
          </h3>
          {loading ? null : error ? null : history.length === 0 ? (
            <DoctorEmptyState size="xs" className="mt-1.5">
              <span>Нет прошлых записей</span>
            </DoctorEmptyState>
          ) : (
            <VisitList visits={history} />
          )}
        </section>

        {/* Extension point (не строим сейчас): краткая статистика программы. */}
        <section className={SECTION_CLASS} aria-labelledby="chat-overview-program-heading">
          <h3 id="chat-overview-program-heading" className={doctorSectionTitleClass}>
            Статистика программы
          </h3>
          <DoctorEmptyState size="xs" className="mt-1.5">
            <span>В следующей итерации</span>
          </DoctorEmptyState>
        </section>
      </div>
    </CatalogLeftPane>
  );
}
