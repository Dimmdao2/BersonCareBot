'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import { doctorClientStackedCardClass } from './doctorClientCardChrome';
import { packageHistoryEventLabel } from './packageHistoryLabels';
import { PatientPackageSessionsList } from './PatientPackageSessionsList';
import { MembershipCardHeader } from '@/shared/ui/doctor/MembershipCardHeader';
import { formatPatientPackageShortLabel } from '@/modules/memberships/display';

export type PatientPackageCardRow = {
  id: string;
  displayNumber?: number | null;
  title: string;
  status: string;
  soldAt: string | null;
  validUntil: string | null;
  priceMinor?: number | null;
  paidAmountMinor: number | null;
  paidCurrency?: string | null;
  notes?: string | null;
  balance: {
    items: Array<{
      patientPackageItemId: string;
      serviceId: string;
      serviceTitle?: string | null;
      quantityInitial?: number;
      remaining: number;
      displayRemaining: number;
      reserved: number;
    }>;
  };
};

type HistoryRow = {
  id: string;
  eventType: string;
  occurredAt: string;
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' });
  } catch {
    return iso;
  }
}

type Props = {
  pkg: PatientPackageCardRow;
  apiBase: string;
  onError?: (code: string | null) => void;
  onChanged?: () => void;
  /** Called when doctor clicks «Пересчитать» on an active package. */
  onRecalc?: () => void;
  mutationsAllowed?: boolean;
};

export function PatientPackageCard({
  pkg,
  apiBase,
  onError,
  onChanged,
  onRecalc,
  mutationsAllowed = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Consume sessions for the human-readable date list
  const [consumeDates, setConsumeDates] = useState<string[] | null>(null);
  const [consumeLoading, setConsumeLoading] = useState(false);

  const notes = notesDraft ?? pkg.notes ?? '';

  const isActive = pkg.status === 'active' || pkg.status === 'activated';

  // Fetch consumed session dates for the active package header
  useEffect(() => {
    if (!isActive) {
      setConsumeDates(null);
      return;
    }
    let alive = true;
    setConsumeLoading(true);
    fetch(`${apiBase}/${pkg.id}/sessions?includePast=true`, { credentials: 'include' })
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{
              ok: boolean;
              sessions?: Array<{ linkage: string; startsAt: string }>;
            }>)
          : null,
      )
      .catch(() => null)
      .then((data) => {
        if (!alive) return;
        const sessions = data?.sessions ?? [];
        setConsumeDates(sessions.filter((s) => s.linkage === 'consumed').map((s) => s.startsAt));
        setConsumeLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkg.id, isActive]);

  const loadHistory = useCallback(async () => {
    const res = await fetch(`${apiBase}/${pkg.id}`);
    const json = (await res.json()) as {
      ok?: boolean;
      history?: HistoryRow[];
      error?: string;
    };
    if (!json.ok) {
      onError?.(json.error ?? 'load_failed');
      return;
    }
    setHistory(json.history ?? []);
  }, [apiBase, onError, pkg.id]);

  useEffect(() => {
    if (!open || !historyOpen || history !== null) return;
    queueMicrotask(() => {
      void loadHistory();
    });
  }, [open, historyOpen, history, loadHistory]);

  function saveNotes() {
    startTransition(async () => {
      const res = await fetch(`${apiBase}/${pkg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes.trim() || null }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        onError?.(json.error ?? 'notes_failed');
        return;
      }
      setNotesDraft(null);
      setHistory(null);
      onError?.(null);
      onChanged?.();
    });
  }

  // Derive totals from balance items
  const balanceItems = pkg.balance.items;
  const totalSessions = balanceItems.reduce(
    (s, it) => s + (it.quantityInitial ?? it.displayRemaining + (it.reserved ?? 0)),
    0,
  );
  const remainingSessions = balanceItems.reduce((s, it) => s + it.displayRemaining, 0);

  return (
    <li className={doctorClientStackedCardClass}>
      {/* Human-readable card header (shared component) */}
      <MembershipCardHeader
        title={pkg.title}
        shortLabel={formatPatientPackageShortLabel(pkg.displayNumber)}
        soldAt={pkg.soldAt}
        totalSessions={totalSessions}
        remainingSessions={remainingSessions}
        items={balanceItems.map((it) => ({
          serviceTitle: it.serviceTitle,
          serviceId: it.serviceId,
          quantityInitial: it.quantityInitial ?? it.displayRemaining + (it.reserved ?? 0),
          remaining: it.displayRemaining,
        }))}
        consumeDates={consumeDates}
        consumeLoading={consumeLoading}
      />

      {/* Action buttons row */}
      <div className="flex items-center gap-1.5">
        {onRecalc ? (
          <Button type="button" size="sm" variant="secondary" onClick={onRecalc} disabled={pending}>
            Пересчитать
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          {open ? 'Свернуть' : 'Записи'}
        </Button>
      </div>

      {/* Balance detail — still shown for reserved info */}
      <ul className="space-y-1 text-sm">
        {pkg.balance.items.map((it) => (
          <li key={it.patientPackageItemId} className="text-xs text-muted-foreground">
            {it.serviceTitle ?? it.serviceId}: остаток {it.displayRemaining}
            {it.reserved > 0 ? ` (зарезервировано ${it.reserved})` : ''}
          </li>
        ))}
      </ul>

      {/* Notes field */}
      {mutationsAllowed ? (
        <div className="space-y-1">
          <Label htmlFor={`notes-${pkg.id}`} className="text-xs">
            Комментарий
          </Label>
          <Input
            id={`notes-${pkg.id}`}
            value={notes}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={saveNotes}
            disabled={pending}
          />
        </div>
      ) : null}

      {/* Expandable: sessions list + history */}
      {open ? (
        <>
          <PatientPackageSessionsList
            packageId={pkg.id}
            apiBase={apiBase}
            onError={(code) => onError?.(code)}
            onChanged={onChanged}
            mutationsAllowed={mutationsAllowed}
          />
          <details
            className="mt-2"
            open={historyOpen}
            onToggle={(e) => setHistoryOpen((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer text-xs font-medium">История</summary>
            {history === null && historyOpen ? (
              <p className="text-muted-foreground mt-1 text-xs">Загрузка…</p>
            ) : null}
            {history && history.length === 0 ? (
              <p className="text-muted-foreground mt-1 text-xs">Нет событий.</p>
            ) : null}
            {history && history.length > 0 ? (
              <ul className="mt-1 space-y-1 text-xs">
                {history.map((h) => (
                  <li key={h.id} className="text-muted-foreground">
                    <span className="text-foreground">{packageHistoryEventLabel(h.eventType)}</span>
                    {' · '}
                    {formatDate(h.occurredAt) ?? h.occurredAt}
                  </li>
                ))}
              </ul>
            ) : null}
          </details>
        </>
      ) : null}
    </li>
  );
}
