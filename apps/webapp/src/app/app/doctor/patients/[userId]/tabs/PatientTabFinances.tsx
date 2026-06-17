"use client";

/**
 * PatientTabFinances — BIG-07 / Phase 1 scaffold.
 *
 * Shows the doctor's financial view for one patient:
 *   1. Кассовый журнал  — patient_payment ledger (cash + acquiring entries)
 *      Source: GET /api/doctor/patients/[userId]/payments
 *   2. Предоплата из записей — be_payment_history_events (placeholder — backend API
 *      for per-patient prepayment history not yet implemented; renders empty state).
 *
 * Acquiring charge initiation form is rendered but calls a STUB route that returns
 * 501/404 until NEEDS-OWNER-3/5 decisions are resolved and keys are provided.
 * NO live charges are possible from this scaffold.
 *
 * Design decisions outstanding → docs/FINANCES_BIG07_DESIGN.md
 */

import { useEffect, useState } from "react";
import { CreditCard, Banknote, RefreshCw, Plus, Copy, AlertCircle } from "lucide-react";
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
  doctorSectionSubtitleClass,
  doctorSectionItemClass,
  doctorStatCardShellClass,
  doctorMetricValueClass,
  doctorMetricLabelClass,
} from "@/shared/ui/doctor/doctorVisual";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PaymentKind = "cash" | "acquiring";
type PaymentStatus = "paid" | "pending" | "refunded" | "failed";

interface PatientPaymentItem {
  id: string;
  amountMinor: number;
  currency?: string;
  kind: PaymentKind;
  status: PaymentStatus;
  comment?: string | null;
  service?: string | null;
  visitId?: string | null;
  provider?: string | null;
  providerPaymentId?: string | null;
  createdAt: string;
}

interface PaymentsApiResponse {
  ok: true;
  payments: PatientPaymentItem[];
  totalPaidMinor: number;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function fmtRub(minorAmount: number): string {
  return (minorAmount / 100).toLocaleString("ru-RU") + " ₽";
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtStatusBadge(status: PaymentStatus) {
  switch (status) {
    case "paid":
      return (
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
          оплачен
        </span>
      );
    case "pending":
      return (
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
          ожидает
        </span>
      );
    case "refunded":
      return (
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground border border-border">
          возврат
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-destructive/10 text-destructive border border-destructive/20">
          ошибка
        </span>
      );
  }
}

// ---------------------------------------------------------------------------
// Cash payment form
// ---------------------------------------------------------------------------

interface CashFormProps {
  userId: string;
  onSuccess: () => void;
}

function CashPaymentForm({ userId, onSuccess }: CashFormProps) {
  const [amountRub, setAmountRub] = useState("");
  const [service, setService] = useState("");
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const rubles = parseFloat(amountRub.replace(",", "."));
    if (!rubles || rubles <= 0) {
      setError("Введите сумму > 0");
      return;
    }
    const amountMinor = Math.round(rubles * 100);
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctor/patients/${encodeURIComponent(userId)}/payments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountMinor,
          comment: comment.trim() || undefined,
          service: service.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? `Ошибка ${res.status}`);
        return;
      }
      setAmountRub("");
      setService("");
      setComment("");
      onSuccess();
    } catch {
      setError("Сетевая ошибка");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-background p-3 flex flex-col gap-2 shadow-sm">
      <p className={cn(doctorSectionTitleClass, "text-xs flex items-center gap-1.5")}>
        <Banknote className="h-3.5 w-3.5 text-muted-foreground" />
        Внести наличные
      </p>
      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex flex-col gap-0.5 min-w-[90px] flex-1">
          <label className="text-[11px] text-muted-foreground">Сумма, ₽</label>
          <input
            type="number"
            min={0}
            step={1}
            placeholder="4000"
            value={amountRub}
            onChange={(e) => setAmountRub(e.target.value)}
            className="h-7 rounded border border-border bg-muted/20 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <div className="flex flex-col gap-0.5 min-w-[120px] flex-1">
          <label className="text-[11px] text-muted-foreground">Услуга</label>
          <input
            type="text"
            placeholder="Приём · 60 мин"
            value={service}
            onChange={(e) => setService(e.target.value)}
            className="h-7 rounded border border-border bg-muted/20 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <div className="flex flex-col gap-0.5 min-w-[120px] flex-1">
          <label className="text-[11px] text-muted-foreground">Комментарий</label>
          <input
            type="text"
            placeholder="доп. инфо…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="h-7 rounded border border-border bg-muted/20 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          disabled={pending}
          onClick={() => void submit()}
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 cursor-pointer disabled:opacity-60"
        >
          {pending ? "…" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Acquiring charge stub form (SANDBOX / keys not yet configured)
// ---------------------------------------------------------------------------

function AcquiringChargeStub() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5 flex items-start gap-2">
      <AlertCircle className="h-4 w-4 flex-none text-amber-600 mt-0.5" />
      <div className="flex flex-col gap-0.5">
        <p className="text-xs font-medium text-amber-800">Эквайринг — ожидает настройки</p>
        <p className="text-[11px] text-amber-700">
          Провайдер (ЮKassa / Тинькофф / CloudPayments) подключается через Настройки → Платежи.
          После добавления ключей здесь появится форма «Отправить ссылку на оплату».
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          NEEDS-OWNER: выбрать провайдер, добавить тестовые ключи (sandox), проверить поток.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Кассовый журнал section
// ---------------------------------------------------------------------------

function CashLedgerSection({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<PatientPaymentItem[] | null>(null);
  const [totalPaidMinor, setTotalPaidMinor] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [showCashForm, setShowCashForm] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/doctor/patients/${encodeURIComponent(userId)}/payments`, {
        credentials: "include",
      });
      const data = (await res.json().catch(() => null)) as PaymentsApiResponse | null;
      if (!res.ok || !data?.ok) {
        setLoadError(true);
        return;
      }
      setPayments(data.payments);
      setTotalPaidMinor(data.totalPaidMinor);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return (
    <div className={doctorSectionCardClass}>
      <div className="flex items-center gap-2 flex-wrap">
        <p className={cn(doctorSectionTitleClass, "flex items-center gap-1.5")}>
          <Banknote className="h-3.5 w-3.5 text-muted-foreground" />
          Кассовый журнал
        </p>
        <button
          type="button"
          onClick={() => void load()}
          title="Обновить"
          className="ml-auto text-muted-foreground hover:text-primary cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {loading && (
        <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>Загрузка…</p>
      )}

      {!loading && loadError && (
        <p className="text-[11px] text-destructive">Не удалось загрузить платежи.</p>
      )}

      {!loading && !loadError && payments !== null && (
        <>
          {/* KPI — Total paid */}
          <div className={cn(doctorStatCardShellClass)}>
            <div className={cn(doctorMetricLabelClass, "mb-0.5")}>Итого оплачено</div>
            <div className={cn(doctorMetricValueClass, "text-base")}>{fmtRub(totalPaidMinor)}</div>
          </div>

          {/* Payment rows */}
          {payments.length === 0 ? (
            <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>
              Нет записей об оплате.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className={cn(doctorSectionItemClass, "flex items-center gap-2 text-xs")}
                >
                  {p.kind === "cash" ? (
                    <Banknote className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                  ) : (
                    <CreditCard className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="truncate">
                      {p.service ?? p.comment ?? (p.kind === "cash" ? "Наличные" : "Эквайринг")}
                    </div>
                    {p.comment && p.service && (
                      <div className="truncate text-muted-foreground text-[11px]">{p.comment}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {fmtStatusBadge(p.status)}
                    <span className="font-semibold tabular-nums whitespace-nowrap">
                      {fmtRub(p.amountMinor)}
                    </span>
                    <span className={cn(doctorSectionSubtitleClass, "whitespace-nowrap text-[11px]")}>
                      {fmtDate(p.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowCashForm((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted cursor-pointer transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Внести наличные
            </button>
          </div>

          {showCashForm && (
            <CashPaymentForm
              userId={userId}
              onSuccess={() => {
                setShowCashForm(false);
                void load();
              }}
            />
          )}
        </>
      )}

      {/* Acquiring stub */}
      <AcquiringChargeStub />

      <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>
        Ручной учёт и эквайринг. Источник: таблица <code className="font-mono">patient_payment</code>.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prepayment from bookings section — placeholder (backend API not yet built)
// ---------------------------------------------------------------------------

function BookingPrepaymentsSection() {
  return (
    <div className={doctorSectionCardClass}>
      <div className="flex items-center gap-2">
        <p className={cn(doctorSectionTitleClass, "flex items-center gap-1.5")}>
          <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
          Предоплата из записей
        </p>
      </div>

      <div className="rounded-lg border border-border bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground">
        История предоплат из записей (be_payment_history_events) пока не выводится — требуется
        отдельный API-эндпоинт{" "}
        <code className="font-mono">
          GET /api/doctor/patients/[userId]/payment-history
        </code>
        .{" "}
        <span className="text-amber-700">NEEDS-OWNER-3: решение по webhook + backend для этого раздела.</span>
      </div>

      <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>
        Источник будет: <code className="font-mono">be_payment_history_events</code> +{" "}
        <code className="font-mono">be_payments</code> по платформенному userId.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

interface PatientTabFinancesProps {
  userId: string;
  active?: boolean;
}

export function PatientTabFinances({ userId, active = false }: PatientTabFinancesProps) {
  // Suspend heavy fetch until tab is actually opened — tabs mount once at card load.
  if (!active) {
    return null;
  }

  return (
    <div className="grid gap-3 p-4" style={{ gridTemplateColumns: "1fr 1fr", alignItems: "start" }}>
      {/* Left column: Кассовый журнал */}
      <CashLedgerSection userId={userId} />

      {/* Right column: Booking prepayments (placeholder) */}
      <BookingPrepaymentsSection />
    </div>
  );
}
