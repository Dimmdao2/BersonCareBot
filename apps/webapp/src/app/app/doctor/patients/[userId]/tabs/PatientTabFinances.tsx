"use client";

/**
 * PatientTabFinances — «Финансы» tab for the patient card.
 *
 * Three sections:
 *   1. KPI row — totals for cash and acquiring payments.
 *   2. Unified payment timeline table — sorted newest-first.
 *   3. «Внести платёж» — two sub-forms: cash entry and acquiring charge.
 *
 * FIN-05
 */

import { useCallback, useEffect, useState } from "react";
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
  doctorStatCardShellClass,
  doctorMetricValueClass,
  doctorMetricLabelClass,
} from "@/shared/ui/doctor/doctorVisual";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Label } from "@/shared/ui/doctor/primitives/label";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PaymentTimelineEntry = {
  id: string;
  occurredAt: string;
  kind: "cash" | "acquiring" | "booking_prepayment" | "booking_refund";
  status: string;
  amountMinor: number | null;
  currency: string;
  description: string | null;
  provider: string | null;
  appointmentId: string | null;
};

type TimelineResponse = {
  ok: boolean;
  timeline: PaymentTimelineEntry[];
  totalCashMinor: number;
  totalAcquiringMinor: number;
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Format minor units (kopecks) → "1 234,56 ₽" */
function fmtMinor(minor: number | null, currency = "RUB"): string {
  if (minor == null) return "—";
  const symbol = currency === "RUB" ? "₽" : currency;
  const rubles = minor / 100;
  return (
    rubles.toLocaleString("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) +
    " " +
    symbol
  );
}

/** Format ISO datetime → "DD.MM.YYYY HH:MM" */
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Kind badge
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<PaymentTimelineEntry["kind"], string> = {
  cash: "НАЛ",
  acquiring: "ЭКВ",
  booking_prepayment: "ПРЕДОП",
  booking_refund: "ВОЗВРАТ",
};

const KIND_BADGE_CLASS: Record<PaymentTimelineEntry["kind"], string> = {
  cash: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  acquiring: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  booking_prepayment: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  booking_refund: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

function KindBadge({ kind }: { kind: PaymentTimelineEntry["kind"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        KIND_BADGE_CLASS[kind],
      )}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Status display
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<string, string> = {
  paid: "оплачен",
  pending: "ожидает",
  refunded: "возврат",
  failed: "отклонён",
};

function StatusText({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status;
  const cls =
    status === "paid"
      ? "text-emerald-700 dark:text-emerald-400"
      : status === "failed"
      ? "text-destructive"
      : status === "refunded"
      ? "text-orange-600 dark:text-orange-400"
      : "text-muted-foreground";
  return <span className={cls}>{label}</span>;
}

// ---------------------------------------------------------------------------
// Copy to clipboard utility
// ---------------------------------------------------------------------------

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // silent
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export type FinancesInitialData = {
  timeline: PaymentTimelineEntry[];
  totalCashMinor: number;
  totalAcquiringMinor: number;
};

type Props = {
  userId: string;
  /** SSR-provided timeline data. When present, skips the initial client fetch. */
  initialData?: FinancesInitialData | null;
};

export function PatientTabFinances({ userId, initialData }: Props) {
  // ---- Timeline state ----
  const [loading, setLoading] = useState(initialData == null);
  const [timeline, setTimeline] = useState<PaymentTimelineEntry[]>(() => initialData?.timeline ?? []);
  const [totalCashMinor, setTotalCashMinor] = useState(() => initialData?.totalCashMinor ?? 0);
  const [totalAcquiringMinor, setTotalAcquiringMinor] = useState(() => initialData?.totalAcquiringMinor ?? 0);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  // ---- Cash form state ----
  const [cashAmount, setCashAmount] = useState("");
  const [cashService, setCashService] = useState("");
  const [cashComment, setCashComment] = useState("");
  const [cashSubmitting, setCashSubmitting] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);
  const [cashSuccess, setCashSuccess] = useState(false);

  // ---- Acquiring form state ----
  const [acqAmount, setAcqAmount] = useState("");
  const [acqDescription, setAcqDescription] = useState("");
  const [acqSubmitting, setAcqSubmitting] = useState(false);
  const [acqError, setAcqError] = useState<string | null>(null);
  const [acqRedirectUrl, setAcqRedirectUrl] = useState<string | null>(null);
  const [acqCopied, setAcqCopied] = useState(false);

  // ---- Fetch timeline ----
  const fetchTimeline = useCallback(async () => {
    setLoading(true);
    setTimelineError(null);
    try {
      const res = await fetch(`/api/doctor/patients/${userId}/payment-timeline`, {
        credentials: "include",
      });
      if (!res.ok) {
        setTimelineError("Не удалось загрузить историю платежей");
        return;
      }
      const data: TimelineResponse = await res.json();
      if (!data.ok) {
        setTimelineError("Ошибка при загрузке истории платежей");
        return;
      }
      setTimeline(data.timeline);
      setTotalCashMinor(data.totalCashMinor);
      setTotalAcquiringMinor(data.totalAcquiringMinor);
    } catch {
      setTimelineError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Skip initial fetch when SSR data provided; fetchTimeline() is still called after payments.
  useEffect(() => {
    if (initialData != null) return;
    void fetchTimeline();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Submit cash payment ----
  async function submitCash(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(cashAmount.replace(",", "."));
    if (isNaN(parsed) || parsed <= 0) {
      setCashError("Введите корректную сумму");
      return;
    }
    const amountMinor = Math.round(parsed * 100);

    setCashSubmitting(true);
    setCashError(null);
    setCashSuccess(false);
    try {
      const res = await fetch(`/api/doctor/patients/${userId}/payments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountMinor,
          comment: cashComment.trim() || undefined,
          service: cashService.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const json: { error?: string } = await res.json().catch(() => ({}));
        setCashError(json.error ?? "Ошибка сохранения");
        return;
      }
      setCashAmount("");
      setCashService("");
      setCashComment("");
      setCashSuccess(true);
      await fetchTimeline();
    } catch {
      setCashError("Ошибка сети");
    } finally {
      setCashSubmitting(false);
    }
  }

  // ---- Submit acquiring charge ----
  async function submitAcquiring(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(acqAmount.replace(",", "."));
    if (isNaN(parsed) || parsed <= 0) {
      setAcqError("Введите корректную сумму");
      return;
    }
    const amountMinor = Math.round(parsed * 100);

    setAcqSubmitting(true);
    setAcqError(null);
    setAcqRedirectUrl(null);
    setAcqCopied(false);
    try {
      const res = await fetch(`/api/doctor/patients/${userId}/acquiring-charge`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountMinor,
          description: acqDescription.trim() || undefined,
        }),
      });
      if (res.status === 503) {
        setAcqError("Провайдер не настроен");
        return;
      }
      if (!res.ok) {
        const json: { error?: string; reason?: string } = await res.json().catch(() => ({}));
        setAcqError(json.error ?? json.reason ?? "Ошибка при создании платежа");
        return;
      }
      const data: { ok: boolean; paymentId: string; redirectUrl: string | null } =
        await res.json();
      setAcqRedirectUrl(data.redirectUrl);
      setAcqAmount("");
      setAcqDescription("");
      await fetchTimeline();
    } catch {
      setAcqError("Ошибка сети");
    } finally {
      setAcqSubmitting(false);
    }
  }

  async function handleCopyLink() {
    if (!acqRedirectUrl) return;
    await copyText(acqRedirectUrl);
    setAcqCopied(true);
    setTimeout(() => setAcqCopied(false), 2000);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-3">
      {/* ================================================================
          SECTION 1 — KPI Row
      ================================================================ */}
      <div className={doctorSectionCardClass}>
        <p className={doctorSectionTitleClass}>Итоги</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className={doctorStatCardShellClass}>
            <p className={doctorMetricLabelClass}>Наличные</p>
            <p className={doctorMetricValueClass}>{fmtMinor(totalCashMinor)}</p>
          </div>
          <div className={doctorStatCardShellClass}>
            <p className={doctorMetricLabelClass}>Эквайринг</p>
            <p className={doctorMetricValueClass}>{fmtMinor(totalAcquiringMinor)}</p>
          </div>
          <div className={cn(doctorStatCardShellClass, "col-span-2 sm:col-span-1")}>
            <p className={doctorMetricLabelClass}>Итого</p>
            <p className={doctorMetricValueClass}>
              {fmtMinor(totalCashMinor + totalAcquiringMinor)}
            </p>
          </div>
        </div>
      </div>

      {/* ================================================================
          SECTION 2 — Timeline
      ================================================================ */}
      <div className={doctorSectionCardClass}>
        <p className={doctorSectionTitleClass}>История платежей</p>

        {loading && (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        )}

        {!loading && timelineError && (
          <p className="text-sm text-destructive">{timelineError}</p>
        )}

        {!loading && !timelineError && timeline.length === 0 && (
          <p className="text-sm text-muted-foreground">Платёжная история пуста</p>
        )}

        {!loading && !timelineError && timeline.length > 0 && (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[540px] text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border/60">
                  <th className="pb-1 pr-3 font-medium pl-1">Дата</th>
                  <th className="pb-1 pr-3 font-medium">Тип</th>
                  <th className="pb-1 pr-3 font-medium text-right">Сумма</th>
                  <th className="pb-1 pr-3 font-medium">Статус</th>
                  <th className="pb-1 font-medium">Описание</th>
                </tr>
              </thead>
              <tbody>
                {timeline.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className="py-1.5 pr-3 pl-1 text-muted-foreground whitespace-nowrap">
                      {fmtDateTime(entry.occurredAt)}
                    </td>
                    <td className="py-1.5 pr-3">
                      <KindBadge kind={entry.kind} />
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap font-medium">
                      {fmtMinor(entry.amountMinor, entry.currency)}
                    </td>
                    <td className="py-1.5 pr-3">
                      <StatusText status={entry.status} />
                    </td>
                    <td className="py-1.5 text-muted-foreground max-w-[180px] truncate">
                      {entry.description ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================================================================
          SECTION 3 — Внести платёж
      ================================================================ */}
      <div className={doctorSectionCardClass}>
        <p className={doctorSectionTitleClass}>Внести платёж</p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* ---- Sub-form A: Наличные ---- */}
          <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/10 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Наличные
            </p>

            <form onSubmit={submitCash} className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="cash-amount" className="text-xs">
                  Сумма (₽)
                </Label>
                <Input
                  id="cash-amount"
                  type="text"
                  inputMode="decimal"
                  placeholder="напр. 1500"
                  value={cashAmount}
                  onChange={(e) => {
                    setCashAmount(e.target.value);
                    setCashError(null);
                    setCashSuccess(false);
                  }}
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="cash-service" className="text-xs">
                  Услуга (необязательно)
                </Label>
                <Input
                  id="cash-service"
                  type="text"
                  placeholder="напр. Консультация"
                  value={cashService}
                  onChange={(e) => setCashService(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="cash-comment" className="text-xs">
                  Комментарий (необязательно)
                </Label>
                <Input
                  id="cash-comment"
                  type="text"
                  placeholder="Произвольный комментарий"
                  value={cashComment}
                  onChange={(e) => setCashComment(e.target.value)}
                />
              </div>

              {cashError && (
                <p className="text-xs text-destructive">{cashError}</p>
              )}
              {cashSuccess && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  Платёж записан
                </p>
              )}

              <Button
                type="submit"
                size="sm"
                disabled={cashSubmitting}
                className="self-start"
              >
                {cashSubmitting ? "Сохранение…" : "Записать наличные"}
              </Button>
            </form>
          </div>

          {/* ---- Sub-form B: Эквайринг ---- */}
          <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/10 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Эквайринг
            </p>

            <form onSubmit={submitAcquiring} className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="acq-amount" className="text-xs">
                  Сумма (₽)
                </Label>
                <Input
                  id="acq-amount"
                  type="text"
                  inputMode="decimal"
                  placeholder="напр. 3000"
                  value={acqAmount}
                  onChange={(e) => {
                    setAcqAmount(e.target.value);
                    setAcqError(null);
                    setAcqRedirectUrl(null);
                  }}
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="acq-description" className="text-xs">
                  Описание (необязательно)
                </Label>
                <Input
                  id="acq-description"
                  type="text"
                  placeholder="напр. Оплата программы"
                  value={acqDescription}
                  onChange={(e) => setAcqDescription(e.target.value)}
                />
              </div>

              {acqError && (
                <p className="text-xs text-destructive">{acqError}</p>
              )}

              <Button
                type="submit"
                size="sm"
                disabled={acqSubmitting}
                className="self-start"
              >
                {acqSubmitting ? "Создание…" : "Создать ссылку на оплату"}
              </Button>
            </form>

            {/* Redirect URL result */}
            {acqRedirectUrl && (
              <div className="mt-1 flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-2.5">
                <p className="text-xs font-medium text-foreground">Ссылка на оплату создана</p>
                <p className="break-all text-xs text-muted-foreground">{acqRedirectUrl}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyLink}
                  className="self-start"
                >
                  {acqCopied ? "Скопировано!" : "Скопировать ссылку"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
