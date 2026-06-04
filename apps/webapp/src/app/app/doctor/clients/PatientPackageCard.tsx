"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { doctorClientStackedCardClass } from "./doctorClientCardChrome";
import { packageHistoryEventLabel } from "./packageHistoryLabels";
import { PatientPackageSessionsList } from "./PatientPackageSessionsList";

export type PatientPackageCardRow = {
  id: string;
  title: string;
  status: string;
  soldAt: string | null;
  validUntil: string | null;
  paidAmountMinor: number | null;
  paidCurrency?: string | null;
  notes?: string | null;
  balance: {
    items: Array<{
      patientPackageItemId: string;
      serviceId: string;
      serviceTitle?: string | null;
      remaining: number;
      displayRemaining: number;
      reserved: number;
    }>;
  };
};

const STATUS_LABELS: Record<string, string> = {
  active: "Активен",
  awaiting_payment: "Ожидает оплаты",
  offered: "Предложен",
};

type HistoryRow = {
  id: string;
  eventType: string;
  occurredAt: string;
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("ru-RU");
  } catch {
    return iso;
  }
}

function formatPaid(minor: number | null, currency?: string | null): string | null {
  if (minor == null) return null;
  const cur = currency ?? "RUB";
  if (cur === "RUB") return `${(minor / 100).toLocaleString("ru-RU")} ₽`;
  return `${minor / 100} ${cur}`;
}

type Props = {
  pkg: PatientPackageCardRow;
  apiBase: string;
  onError?: (code: string | null) => void;
  onChanged?: () => void;
};

export function PatientPackageCard({ pkg, apiBase, onError, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const notes = notesDraft ?? (pkg.notes ?? "");

  const soldLabel = formatDate(pkg.soldAt);
  const validLabel = formatDate(pkg.validUntil);
  const paidLabel = formatPaid(pkg.paidAmountMinor, pkg.paidCurrency);

  const loadHistory = useCallback(async () => {
    const res = await fetch(`${apiBase}/${pkg.id}`);
    const json = (await res.json()) as {
      ok?: boolean;
      history?: HistoryRow[];
      error?: string;
    };
    if (!json.ok) {
      onError?.(json.error ?? "load_failed");
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
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes.trim() || null }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        onError?.(json.error ?? "notes_failed");
        return;
      }
      setNotesDraft(null);
      setHistory(null);
      onError?.(null);
      onChanged?.();
    });
  }

  return (
    <li className={doctorClientStackedCardClass}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{pkg.title}</p>
          <p className="text-muted-foreground text-xs">
            {STATUS_LABELS[pkg.status] ?? pkg.status}
            {soldLabel ? ` · продажа ${soldLabel}` : ""}
            {validLabel ? ` · до ${validLabel}` : ""}
            {paidLabel ? ` · оплачено ${paidLabel}` : ""}
          </p>
          {pkg.notes?.trim() ? (
            <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{pkg.notes}</p>
          ) : null}
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          {open ? "Свернуть" : "Записи"}
        </Button>
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {pkg.balance.items.map((it) => (
          <li key={it.patientPackageItemId}>
            {it.serviceTitle ?? it.serviceId}: остаток {it.displayRemaining}
            {it.reserved > 0 ? ` (зарезервировано ${it.reserved})` : ""}
          </li>
        ))}
      </ul>
      <div className="mt-2 space-y-1">
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
      {open ? (
        <>
          <PatientPackageSessionsList
            packageId={pkg.id}
            apiBase={apiBase}
            onError={(code) => onError?.(code)}
            onChanged={onChanged}
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
                    {" · "}
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
