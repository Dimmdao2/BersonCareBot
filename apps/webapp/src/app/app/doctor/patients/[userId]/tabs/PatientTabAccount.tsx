"use client";

/**
 * PatientTabAccount — Wave 4 fully-wired version.
 *
 * Blocks wired to real endpoints:
 *  1. Блокировки и доступ — POST /api/doctor/clients/{userId}/block  { blocked, reason? }
 *  2. Архив             — PATCH /api/doctor/clients/{userId}/archive { archived }
 *  3. Сопровождение     — GET/PATCH /api/doctor/clients/{userId}/support-settings
 *                         { onSupport, commentsEnabled?, mediaEnabled? }
 *  4. Репутация записи  — READ ONLY from header (totalVisits/cancellationsCount/reschedulesCount)
 *  5. Платежи           — GET/POST /api/doctor/patients/{userId}/payments (guard 404/500)
 *  6. Администрирование — <AdminMergeAccountsPanel> + <AdminClientAuditHistorySection>
 *                         (same props as DoctorClientCardAdminSection)
 *
 * KEEP MOCK / TODO(backend) (not in scope):
 *   - birthDate/gender — no schema field
 *   - support start date — not in PatientCardHeader
 *   - rubitime_id / identity.createdAt — not in PatientCardHeader
 *   - noShow count — not in PatientCardHeader
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
  doctorSectionSubtitleClass,
  doctorMetricLabelClass,
  doctorMetricValueClass,
  doctorStatCardShellClass,
  doctorStatCardShellWarningClass,
  doctorHistoryRowClass,
  doctorSectionItemClass,
} from "@/shared/ui/doctor/doctorVisual";
import { cn } from "@/lib/utils";
import { AdminMergeAccountsPanel } from "@/app/app/doctor/clients/AdminMergeAccountsPanel";
import { AdminClientAuditHistorySection } from "@/app/app/doctor/clients/AdminClientAuditHistorySection";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  userId: string;
  header?: PatientCardHeader;
  /**
   * Whether the «Учётка» tab is the active tab. Tabs mount once on card load
   * (load-once + client-side switching), so admin-only fetches here (merge
   * candidates, audit log) must stay suspended until the tab is actually
   * opened — otherwise every patient-card view fires wasteful 403s for
   * non-admin doctor sessions.
   */
  active?: boolean;
};

/** Shape returned by GET /api/doctor/clients/{userId}/support-settings */
type SupportSettingsResponse = {
  ok: true;
  profile: {
    patientUserId: string;
    onSupport: boolean;
    commentsEnabled: boolean | null;
    mediaEnabled: boolean | null;
    updatedAt: string | null;
    updatedBy: string | null;
  };
  effectivePolicy: {
    onSupport: boolean;
    commentsAllowed: boolean;
    mediaAllowed: boolean;
  };
};

/** Shape of a payment item from GET /api/doctor/patients/{userId}/payments */
type PaymentItem = {
  id: string;
  amountMinor: number;
  currency?: string;
  kind: "cash" | "acquiring";
  status: string;
  comment?: string | null;
  service?: string | null;
  visitId?: string | null;
  createdAt: string;
};

type PaymentsResponse = {
  ok: true;
  payments: PaymentItem[];
  totalPaidMinor: number;
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtRub(minorAmount: number): string {
  return (minorAmount / 100).toLocaleString("ru-RU") + " ₽";
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* silent */
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Section card wrapper with title row */
function SectionCard({
  title,
  titleRight,
  children,
  className,
}: {
  title: string;
  titleRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(doctorSectionCardClass, className)}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={doctorSectionTitleClass}>{title}</span>
        {titleRight && <span className="ml-auto">{titleRight}</span>}
      </div>
      {children}
    </div>
  );
}

/** Compact key–value table row */
function KVRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td className="py-0.5 pr-3 text-xs text-muted-foreground w-[42%] align-top">{label}</td>
      <td className="py-0.5 text-xs text-foreground align-top">{children}</td>
    </tr>
  );
}

/** Channel binding row */
function ChannelRow({
  icon,
  label,
  value,
  hint,
  status,
  actionIcon,
  onAction,
  warning,
}: {
  icon: string;
  label: string;
  value: string;
  hint?: string;
  status: "active" | "problem" | "none";
  actionIcon?: string;
  onAction?: () => void;
  warning?: boolean;
}) {
  const chipStyles =
    status === "active"
      ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
      : status === "problem"
        ? "bg-destructive/10 text-destructive border border-destructive/20"
        : "bg-muted text-muted-foreground border border-border";
  const chipText = status === "active" ? "подключён" : status === "problem" ? "не подтв." : "нет";

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5",
        warning
          ? "border-orange-200 bg-orange-50/60"
          : "border-border bg-background",
      )}
    >
      <span className="w-5 flex-none text-center text-sm">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-mono leading-tight text-foreground truncate">{value}</div>
        <div className={cn(doctorSectionSubtitleClass, "text-[11px]")}>{hint ?? label}</div>
      </div>
      <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium", chipStyles)}>
        {chipText}
      </span>
      {actionIcon && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-muted/30 text-[11px] text-muted-foreground hover:bg-muted cursor-pointer"
        >
          {actionIcon}
        </button>
      )}
    </div>
  );
}

/** Mini KPI stat card */
function StatCard({
  label,
  value,
  alert,
}: {
  label: string;
  value: string | number;
  alert?: boolean;
}) {
  return (
    <div className={cn(alert ? doctorStatCardShellWarningClass : doctorStatCardShellClass)}>
      <div className={cn(doctorMetricLabelClass, "mb-0.5")}>{label}</div>
      <div className={cn(doctorMetricValueClass, "text-base")}>{value}</div>
    </div>
  );
}

/** Inline toggle row for support booleans */
function ToggleRow({
  label,
  value,
  onChange,
  pending,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  pending?: boolean;
}) {
  return (
    <div className={cn(doctorHistoryRowClass, "flex items-center gap-2 text-xs")}>
      <span className="flex-1">{label}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => onChange(!value)}
        className={cn(
          "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none",
          value ? "bg-primary" : "bg-muted",
          pending && "opacity-60 cursor-not-allowed",
        )}
        role="switch"
        aria-checked={value}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
            value ? "translate-x-4" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}

/**
 * Доп. телефоны пациента (платформенные доп. контакты, contact_type='phone').
 * Основной телефон не редактируется ни врачом, ни админом — здесь только ДОБАВЛЕНИЕ
 * вторичных номеров (owner-правило). Бэкенд: /api/doctor/clients/:id/supplementary-contacts.
 */
type SupplementaryContact = { id: string; contactType: string; value: string; source: string };

function SecondaryPhones({ userId }: { userId: string }) {
  const [phones, setPhones] = useState<SupplementaryContact[] | null>(null);
  const [error, setError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/supplementary-contacts`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ contacts: SupplementaryContact[] }>) : null))
      .then((d) => {
        if (!d) {
          setError(true);
          setPhones([]);
          return;
        }
        setError(false);
        setPhones((d.contacts ?? []).filter((c) => c.contactType === "phone"));
      })
      .catch(() => {
        setError(true);
        setPhones([]);
      });
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    const value = input.trim();
    if (!value) {
      setAddError("Введите номер");
      return;
    }
    setSaving(true);
    setAddError(null);
    try {
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(userId)}/supplementary-contacts`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactType: "phone", value }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setAddError(
          body?.error === "matches_identity"
            ? "Совпадает с основным телефоном"
            : body?.error === "invalid_value"
              ? "Некорректный номер"
              : "Не удалось добавить",
        );
        return;
      }
      setInput("");
      setAdding(false);
      load();
    } catch {
      setAddError("Не удалось добавить");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const prev = phones;
    setPhones((list) => (list ? list.filter((p) => p.id !== id) : list));
    try {
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(userId)}/supplementary-contacts/${encodeURIComponent(id)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) setPhones(prev ?? null);
    } catch {
      setPhones(prev ?? null);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      {phones?.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-2 rounded-lg border border-border bg-muted/10 px-2.5 py-1.5 text-xs"
        >
          <span className="w-5 flex-none text-center text-sm">📱</span>
          <span className="flex-1 min-w-0 truncate font-mono">{p.value}</span>
          <span className={cn(doctorSectionSubtitleClass, "text-[11px]")}>доп. телефон</span>
          <button
            type="button"
            title="Удалить"
            onClick={() => remove(p.id)}
            className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-muted/30 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive cursor-pointer"
          >
            ×
          </button>
        </div>
      ))}

      {error && phones?.length === 0 && (
        <span className="text-[11px] text-destructive">Не удалось загрузить доп. телефоны.</span>
      )}

      {adding ? (
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              } else if (e.key === "Escape") {
                setAdding(false);
              }
            }}
            placeholder="+7 999 000-00-00"
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={add}
            disabled={saving}
            className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "…" : "Добавить"}
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            disabled={saving}
            className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Отмена
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="self-start text-[11px] text-primary hover:underline cursor-pointer"
        >
          + доп. телефон
        </button>
      )}
      {addError && <span className="text-[11px] text-destructive">{addError}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PatientTabAccount({ userId, header, active = false }: Props) {
  const identity = header?.identity;
  const support = header?.support;
  const cancellationsCount = header?.cancellationsCount ?? 0;
  const reschedulesCount = header?.reschedulesCount ?? 0;
  const totalVisits = header?.totalVisits ?? 0;

  // Derived channel info from header
  const hasTelegram = Boolean(identity?.bindings?.telegramId);
  const hasMax = Boolean(identity?.bindings?.maxId);
  const hasEmail = Boolean(identity?.email);
  const telegramId = identity?.bindings?.telegramId ?? null;
  const maxId = identity?.bindings?.maxId ?? null;

  // ---------------------------------------------------------------------------
  // Block state (optimistic from header; confirmed by POST)
  // ---------------------------------------------------------------------------
  const [isBlocked, setIsBlocked] = useState(identity?.isBlocked ?? false);
  const [blockPending, setBlockPending] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);

  // Sync when header arrives
  useEffect(() => {
    if (identity?.isBlocked !== undefined) setIsBlocked(identity.isBlocked);
  }, [identity?.isBlocked]);

  async function handleBlockToggle() {
    const nextBlocked = !isBlocked;
    setBlockPending(true);
    setBlockError(null);
    // Optimistic
    setIsBlocked(nextBlocked);
    try {
      const res = await fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/block`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocked: nextBlocked }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        // Rollback
        setIsBlocked(!nextBlocked);
        setBlockError(data.error ?? `Ошибка ${res.status}`);
      }
    } catch {
      setIsBlocked(!nextBlocked);
      setBlockError("network");
    } finally {
      setBlockPending(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Archive state (optimistic from header; confirmed by PATCH)
  // ---------------------------------------------------------------------------
  const [isArchived, setIsArchived] = useState(identity?.isArchived ?? false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [archivePending, setArchivePending] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  useEffect(() => {
    if (identity?.isArchived !== undefined) setIsArchived(identity.isArchived);
  }, [identity?.isArchived]);

  async function handleArchiveToggle() {
    const nextArchived = !isArchived;
    setArchivePending(true);
    setArchiveError(null);
    setArchiveConfirm(false);
    setIsArchived(nextArchived); // optimistic
    try {
      const res = await fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/archive`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: nextArchived }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setIsArchived(!nextArchived); // rollback
        setArchiveError(data.error ?? `Ошибка ${res.status}`);
      }
    } catch {
      setIsArchived(!nextArchived);
      setArchiveError("network");
    } finally {
      setArchivePending(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Support settings (GET on mount; PATCH on toggle)
  // ---------------------------------------------------------------------------
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [onSupport, setOnSupport] = useState(support?.isOnSupport ?? false);
  const [commentsEnabled, setCommentsEnabled] = useState<boolean | null>(null);
  const [mediaEnabled, setMediaEnabled] = useState<boolean | null>(null);
  /** effectivePolicy — what the patient actually sees */
  const [effectiveCommentsAllowed, setEffectiveCommentsAllowed] = useState(true);
  const [effectiveMediaAllowed, setEffectiveMediaAllowed] = useState(true);
  const [supportPatchPending, setSupportPatchPending] = useState(false);
  const supportFetchedRef = useRef(false);

  const loadSupportSettings = useCallback(async () => {
    setSupportLoading(true);
    setSupportError(null);
    try {
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(userId)}/support-settings`,
        { credentials: "include" },
      );
      const data = (await res.json().catch(() => null)) as SupportSettingsResponse | null;
      if (!res.ok || !data?.ok) {
        setSupportError((data as { error?: string } | null)?.error ?? `Ошибка ${res.status}`);
        return;
      }
      setOnSupport(data.profile.onSupport);
      setCommentsEnabled(data.profile.commentsEnabled);
      setMediaEnabled(data.profile.mediaEnabled);
      setEffectiveCommentsAllowed(data.effectivePolicy.commentsAllowed);
      setEffectiveMediaAllowed(data.effectivePolicy.mediaAllowed);
    } catch {
      setSupportError("network");
    } finally {
      setSupportLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!supportFetchedRef.current) {
      supportFetchedRef.current = true;
      void loadSupportSettings();
    }
  }, [loadSupportSettings]);

  async function patchSupport(patch: {
    onSupport?: boolean;
    commentsEnabled?: boolean | null;
    mediaEnabled?: boolean | null;
  }) {
    setSupportPatchPending(true);
    setSupportError(null);
    try {
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(userId)}/support-settings`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      const data = (await res.json().catch(() => null)) as SupportSettingsResponse | null;
      if (!res.ok || !data?.ok) {
        setSupportError((data as { error?: string } | null)?.error ?? `Ошибка ${res.status}`);
        return;
      }
      setOnSupport(data.profile.onSupport);
      setCommentsEnabled(data.profile.commentsEnabled);
      setMediaEnabled(data.profile.mediaEnabled);
      setEffectiveCommentsAllowed(data.effectivePolicy.commentsAllowed);
      setEffectiveMediaAllowed(data.effectivePolicy.mediaAllowed);
    } catch {
      setSupportError("network");
    } finally {
      setSupportPatchPending(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Payments (GET; POST for manual cash)
  // ---------------------------------------------------------------------------
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsUnavailable, setPaymentsUnavailable] = useState(false);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [payments, setPayments] = useState<PaymentItem[] | null>(null);
  const [totalPaidMinor, setTotalPaidMinor] = useState(0);
  const paymentsFetchedRef = useRef(false);

  const loadPayments = useCallback(async () => {
    setPaymentsLoading(true);
    setPaymentsError(null);
    setPaymentsUnavailable(false);
    try {
      const res = await fetch(
        `/api/doctor/patients/${encodeURIComponent(userId)}/payments`,
        { credentials: "include" },
      );
      if (res.status === 404 || res.status === 501) {
        setPaymentsUnavailable(true);
        return;
      }
      const data = (await res.json().catch(() => null)) as PaymentsResponse | null;
      if (!res.ok || !data?.ok) {
        // Could be 500 while endpoint is being built
        setPaymentsUnavailable(true);
        return;
      }
      setPayments(data.payments);
      setTotalPaidMinor(data.totalPaidMinor);
    } catch {
      setPaymentsUnavailable(true);
    } finally {
      setPaymentsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!paymentsFetchedRef.current) {
      paymentsFetchedRef.current = true;
      void loadPayments();
    }
  }, [loadPayments]);

  // Cash payment form state
  const [showCashForm, setShowCashForm] = useState(false);
  const [cashAmountRub, setCashAmountRub] = useState("");
  const [cashComment, setCashComment] = useState("");
  const [cashService, setCashService] = useState("");
  const [cashPending, setCashPending] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);

  async function handleSubmitCash() {
    const rubles = parseFloat(cashAmountRub.replace(",", "."));
    if (!rubles || rubles <= 0) {
      setCashError("Введите сумму > 0");
      return;
    }
    const amountMinor = Math.round(rubles * 100);
    setCashPending(true);
    setCashError(null);
    try {
      const res = await fetch(
        `/api/doctor/patients/${encodeURIComponent(userId)}/payments`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountMinor,
            comment: cashComment.trim() || undefined,
            service: cashService.trim() || undefined,
          }),
        },
      );
      if (res.status === 404 || res.status === 501) {
        setCashError("Эндпоинт платежей ещё не готов — попробуйте позже.");
        return;
      }
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setCashError(data?.error ?? `Ошибка ${res.status}`);
        return;
      }
      // Reload payments list
      setCashAmountRub("");
      setCashComment("");
      setCashService("");
      setShowCashForm(false);
      paymentsFetchedRef.current = false;
      void loadPayments();
    } catch {
      setCashError("network");
    } finally {
      setCashPending(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr", alignItems: "start" }}>
      {/* ====================================================================
          LEFT COLUMN
      ==================================================================== */}
      <div className="flex flex-col gap-3">

        {/* ── 1. Личные данные ─────────────────────────────────────── */}
        <SectionCard
          title="Личные данные"
          titleRight={
            <button
              type="button"
              className="text-xs text-primary hover:underline cursor-pointer"
            >
              ✎ изменить
            </button>
          }
        >
          <table className="w-full border-separate border-spacing-0">
            <tbody>
              {/* displayName — bold primary name */}
              <KVRow label="Отображаемое имя">
                <span className="font-semibold">{identity?.displayName ?? "—"}</span>
              </KVRow>
              {/* Hidden real name */}
              {(identity?.firstName || identity?.lastName) ? (
                <KVRow label="ФИО (скрытое)">
                  <span className="text-muted-foreground text-[11px]">
                    {[identity?.lastName, identity?.firstName].filter(Boolean).join(" ")}
                  </span>
                </KVRow>
              ) : (
                <KVRow label="ФИО (скрытое)">
                  <span className="text-muted-foreground text-[11px]">не указано</span>
                </KVRow>
              )}
              {/* Phone */}
              <KVRow label="Телефон">
                {identity?.phone ? (
                  <button
                    type="button"
                    title="Скопировать"
                    onClick={() => copyText(identity.phone!)}
                    className="font-mono text-[11px] hover:text-primary cursor-pointer"
                  >
                    {identity.phone} ⧉
                  </button>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </KVRow>
              {/* Email */}
              <KVRow label="Email">
                {identity?.email ? (
                  <span className="font-mono text-[11px]">{identity.email}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </KVRow>
              {/* Birth date — TODO(backend) */}
              <KVRow label="Дата рождения">
                {/* TODO(backend): birthDate not yet in PatientCardHeader; no schema field */}
                <span className="text-muted-foreground">—</span>
              </KVRow>
              {/* Gender — TODO(backend) */}
              <KVRow label="Пол">
                {/* TODO(backend): gender field not in schema */}
                <span className="text-muted-foreground">—</span>
              </KVRow>
            </tbody>
          </table>
          <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>
            ФИО видит только специалист, пациенту показывается отображаемое имя.
          </p>
        </SectionCard>

        {/* ── 2. Контакты и каналы ─────────────────────────────────── */}
        <SectionCard
          title="Контакты и каналы"
          titleRight={
            <button type="button" className="text-xs text-primary hover:underline cursor-pointer">
              + добавить
            </button>
          }
        >
          <div className="flex flex-col gap-1.5">
            {/* Phone */}
            <ChannelRow
              icon="📞"
              label="Телефон"
              value={identity?.phone ?? "—"}
              hint="основной телефон · не редактируется"
              status={identity?.phone ? "active" : "none"}
              actionIcon="⧉"
              onAction={() => copyText(identity?.phone ?? "")}
            />

            {/* Доп. телефоны (основной не меняется; только добавление вторичных) */}
            <SecondaryPhones userId={userId} />

            {/* Telegram */}
            <ChannelRow
              icon="✈️"
              label="Telegram"
              value={hasTelegram ? `id ${telegramId}` : "не привязан"}
              hint="Telegram"
              status={hasTelegram ? "active" : "none"}
              actionIcon={hasTelegram ? "💬" : "＋"}
            />

            {/* MAX */}
            <ChannelRow
              icon="Ⓜ️"
              label="MAX"
              value={hasMax ? `id ${maxId}` : "не привязан"}
              hint="MAX"
              status={hasMax ? "active" : "none"}
              actionIcon={hasMax ? "💬" : "＋"}
            />

            {/* Email */}
            {hasEmail ? (
              <ChannelRow
                icon="✉️"
                label="Email"
                value={identity?.email ?? "—"}
                hint={
                  // TODO(backend): emailVerifiedAt not in PatientCardHeader; assume unverified display
                  "Email · статус неизвестен"
                }
                status="problem"
                warning
                actionIcon="✉️"
                onAction={() => window.open(`mailto:${identity?.email}`, "_blank")}
              />
            ) : (
              <ChannelRow
                icon="✉️"
                label="Email"
                value="не указан"
                hint="Email"
                status="none"
                actionIcon="＋"
              />
            )}

            {/* PWA / App — TODO(backend) */}
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/10 px-2.5 py-1.5">
              <span className="w-5 flex-none text-center text-sm">📲</span>
              <div className="flex-1 min-w-0">
                {/* TODO(backend): PWA install / push status not tracked in current schema */}
                <div className="text-xs text-muted-foreground leading-tight">данные недоступны</div>
                <div className={cn(doctorSectionSubtitleClass, "text-[11px]")}>приложение пациента</div>
              </div>
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                нет данных
              </span>
            </div>
          </div>
          <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>
            <span className="text-emerald-600 font-medium">подключён</span> → иконка активна и кликабельна ·{" "}
            <span className="text-destructive font-medium">проблема</span> — подсвечена.
          </p>
        </SectionCard>

        {/* ── 3. Сопровождение (административный) ─────────────────── */}
        {/* Lifecycle + support flags; program/abonement detail lives on Обзор */}
        <SectionCard
          title="Сопровождение и статус"
          titleRight={
            onSupport ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                ★ На сопровождении
              </span>
            ) : undefined
          }
        >
          {supportLoading && (
            <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>Загрузка…</p>
          )}
          {supportError && !supportLoading && (
            <p className="text-[11px] text-destructive">{supportError}</p>
          )}
          {!supportLoading && (
            <div className="flex flex-col gap-1">
              <ToggleRow
                label="На сопровождении"
                value={onSupport}
                pending={supportPatchPending}
                onChange={(v) => {
                  setOnSupport(v);
                  void patchSupport({ onSupport: v });
                }}
              />
              <ToggleRow
                label={`Комментарии к упражнениям (факт: ${effectiveCommentsAllowed ? "разрешены" : "заблокированы"})`}
                value={commentsEnabled ?? effectiveCommentsAllowed}
                pending={supportPatchPending}
                onChange={(v) => {
                  setCommentsEnabled(v);
                  void patchSupport({ commentsEnabled: v });
                }}
              />
              <ToggleRow
                label={`Медиафайлы (факт: ${effectiveMediaAllowed ? "разрешены" : "заблокированы"})`}
                value={mediaEnabled ?? effectiveMediaAllowed}
                pending={supportPatchPending}
                onChange={(v) => {
                  setMediaEnabled(v);
                  void patchSupport({ mediaEnabled: v });
                }}
              />
            </div>
          )}

          {/* Read-only lifecycle summary */}
          <table className="w-full border-separate border-spacing-0 mt-1">
            <tbody>
              <KVRow label="Источник">
                <span className="text-muted-foreground">
                  {identity?.bindings?.telegramId
                    ? "Telegram-бот"
                    : identity?.bindings?.maxId
                      ? "MAX-бот"
                      : "—"}
                </span>
              </KVRow>
              <KVRow label="Сопровождение с">
                {/* TODO(backend): support start date not in PatientCardHeader */}
                <span className="text-muted-foreground">—</span>
              </KVRow>
              <KVRow label="Программа / Абонемент">
                {/* TODO(backend): activeTreatmentProgram/membership not in PatientCardHeader; shown on Обзор */}
                <span className="text-muted-foreground text-[11px]">
                  см. вкладку «Обзор»
                </span>
              </KVRow>
            </tbody>
          </table>
          <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>
            Административные флаги: включение сопровождения и доступ к комментариям/медиа.
            Детали программы и абонемента — на вкладке «Обзор».
          </p>
        </SectionCard>

        {/* ── 4. Платежи и расчёты ─────────────────────────────────── */}
        <SectionCard
          title="Платежи и расчёты"
          titleRight={
            !paymentsUnavailable && payments && (
              <button
                type="button"
                onClick={() => {
                  paymentsFetchedRef.current = false;
                  void loadPayments();
                }}
                className="text-xs text-muted-foreground hover:text-primary cursor-pointer"
              >
                обновить
              </button>
            )
          }
        >
          {paymentsLoading && (
            <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>Загрузка платежей…</p>
          )}

          {paymentsUnavailable && !paymentsLoading && (
            <div className="rounded-lg border border-border bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground">
              Платежи недоступны — эндпоинт строится параллельным агентом.
              Данные появятся после деплоя миграции.
            </div>
          )}

          {paymentsError && !paymentsUnavailable && !paymentsLoading && (
            <p className="text-[11px] text-destructive">{paymentsError}</p>
          )}

          {!paymentsUnavailable && !paymentsLoading && payments !== null && (
            <>
              {/* Total */}
              <div className={cn(doctorStatCardShellClass)}>
                <div className={cn(doctorMetricLabelClass, "mb-0.5")}>Итого оплачено</div>
                <div className={cn(doctorMetricValueClass, "text-base")}>{fmtRub(totalPaidMinor)}</div>
              </div>

              {/* Payment list */}
              {payments.length === 0 ? (
                <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>Нет записей об оплате.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {payments.map((p) => (
                    <div
                      key={p.id}
                      className={cn(doctorHistoryRowClass, "flex items-center gap-2 text-xs")}
                    >
                      <span className="flex-none">
                        {p.kind === "cash" ? "💵" : "💳"}
                      </span>
                      <span className="flex-1 truncate">
                        {p.service ?? p.comment ?? (p.kind === "cash" ? "Наличные" : "Эквайринг")}
                        {p.comment && p.service && (
                          <span className="text-muted-foreground ml-1">· {p.comment}</span>
                        )}
                      </span>
                      <span className="font-semibold tabular-nums whitespace-nowrap">
                        {fmtRub(p.amountMinor)}
                      </span>
                      <span className={cn(doctorSectionSubtitleClass, "whitespace-nowrap pl-2")}>
                        {fmtDate(p.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Manual cash form */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCashForm((v) => !v);
                    setCashError(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted cursor-pointer transition-colors"
                >
                  💵 Внести наличные
                </button>
                {/* Acquiring: provider not chosen yet */}
                <span className="text-[11px] text-muted-foreground">
                  Эквайринг — скоро
                </span>
              </div>

              {showCashForm && (
                <div className="rounded-lg border border-border bg-background p-3 flex flex-col gap-2 shadow-sm">
                  <p className={cn(doctorSectionTitleClass, "text-xs")}>Внести наличные</p>
                  <div className="flex gap-2 items-end flex-wrap">
                    <div className="flex flex-col gap-0.5 flex-1 min-w-[100px]">
                      <label className="text-[11px] text-muted-foreground">Сумма, ₽</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        placeholder="4000"
                        value={cashAmountRub}
                        onChange={(e) => setCashAmountRub(e.target.value)}
                        className="h-7 rounded border border-border bg-muted/20 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                    </div>
                    <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
                      <label className="text-[11px] text-muted-foreground">Услуга</label>
                      <input
                        type="text"
                        placeholder="Приём · 60 мин"
                        value={cashService}
                        onChange={(e) => setCashService(e.target.value)}
                        className="h-7 rounded border border-border bg-muted/20 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                    </div>
                    <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
                      <label className="text-[11px] text-muted-foreground">Комментарий</label>
                      <input
                        type="text"
                        placeholder="доп. инфо…"
                        value={cashComment}
                        onChange={(e) => setCashComment(e.target.value)}
                        className="h-7 rounded border border-border bg-muted/20 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                    </div>
                  </div>
                  {cashError && (
                    <p className="text-[11px] text-destructive">{cashError}</p>
                  )}
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      disabled={cashPending}
                      onClick={() => { setShowCashForm(false); setCashError(null); }}
                      className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted cursor-pointer"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      disabled={cashPending}
                      onClick={() => void handleSubmitCash()}
                      className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 cursor-pointer disabled:opacity-60"
                    >
                      {cashPending ? "…" : "Сохранить"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>
            Учёт наличных платежей. Эквайринг (провайдер не выбран) — следующий этап.
          </p>
        </SectionCard>
      </div>

      {/* ====================================================================
          RIGHT COLUMN
      ==================================================================== */}
      <div className="flex flex-col gap-3">

        {/* ── 5. Репутация записи (READ ONLY) ──────────────────────── */}
        <SectionCard
          title="Репутация записи"
          titleRight={
            <span className={cn(doctorSectionSubtitleClass, "text-[11px]")}>из header</span>
          }
        >
          {/* KPI grid */}
          <div className="grid grid-cols-4 gap-1.5">
            <StatCard label="Визитов" value={totalVisits} />
            <StatCard label="Отмен" value={cancellationsCount} alert={cancellationsCount >= 2} />
            {/* TODO(backend): noShow count not in PatientCardHeader */}
            <StatCard label="Неявок" value="—" />
            <StatCard label="Переносов" value={reschedulesCount} alert={reschedulesCount >= 3} />
          </div>

          {/* Reputation flags */}
          {reschedulesCount >= 3 && (
            <div className={cn(doctorSectionItemClass, "flex items-center gap-2 text-xs")}>
              <span className="text-destructive flex-none">⚑</span>
              <span className="flex-1">
                Отметка «склонен к переносам» — {reschedulesCount} переноса
              </span>
              {/* TODO(backend): manual override (снять отметку) endpoint not available yet */}
            </div>
          )}
          {cancellationsCount >= 2 && (
            <div className={cn(doctorSectionItemClass, "flex items-center gap-2 text-xs border-destructive/30 bg-destructive/5")}>
              <span className="text-destructive flex-none">⚑</span>
              <span className="flex-1">
                Отметка «склонен к отменам» — {cancellationsCount} отмены
              </span>
              {/* TODO(backend): manual override (снять отметку) endpoint not available yet */}
            </div>
          )}

          <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>
            Счётчики из header: визиты, отмены, переносы. Неявки и ручная отметка — TODO(backend).
          </p>
        </SectionCard>

        {/* ── 6. Блокировки и доступ ───────────────────────────────── */}
        <SectionCard title="Блокировки и доступ">
          <div className="flex flex-col gap-1.5">
            {/* Telegram bot status */}
            <div className={cn(doctorHistoryRowClass, "flex items-center gap-2 text-xs")}>
              <span className="flex-none">✈️</span>
              <span className="flex-1">Telegram-бот</span>
              {hasTelegram ? (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                  привязан
                </span>
              ) : (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                  не привязан
                </span>
              )}
            </div>

            {/* MAX bot */}
            <div className={cn(doctorHistoryRowClass, "flex items-center gap-2 text-xs")}>
              <span className="flex-none">Ⓜ️</span>
              <span className="flex-1">{hasMax ? "MAX-бот" : "MAX-бот не привязан"}</span>
              {hasMax ? (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                  привязан
                </span>
              ) : (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                  нет
                </span>
              )}
            </div>

            {/* Block status indicator */}
            {isBlocked && (
              <div className={cn(doctorSectionItemClass, "flex items-center gap-2 text-xs border-destructive/30 bg-destructive/5")}>
                <span className="text-destructive flex-none">⛔</span>
                <span className="flex-1 text-destructive font-medium">Пациент заблокирован</span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            {/* Block / Unblock — POST /api/doctor/clients/{userId}/block {blocked, reason?} */}
            <button
              type="button"
              disabled={blockPending}
              onClick={() => void handleBlockToggle()}
              className={cn(
                "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors disabled:opacity-60",
                isBlocked
                  ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
                  : "border-border bg-muted/30 text-foreground hover:bg-muted",
              )}
            >
              {blockPending ? "…" : isBlocked ? "⛔ Снять блокировку" : "Ограничить доступ"}
            </button>

            {/* Archive / Unarchive — PATCH /api/doctor/clients/{userId}/archive {archived} */}
            {!archiveConfirm ? (
              <button
                type="button"
                disabled={archivePending}
                onClick={() => setArchiveConfirm(true)}
                className={cn(
                  "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors disabled:opacity-60",
                  isArchived
                    ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                    : "border-border bg-muted/30 text-foreground hover:bg-muted",
                )}
              >
                {archivePending ? "…" : isArchived ? "Вернуть из архива" : "В архив"}
              </button>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-destructive">
                Подтвердить?{" "}
                <button
                  type="button"
                  onClick={() => void handleArchiveToggle()}
                  className="underline cursor-pointer"
                >
                  Да
                </button>{" "}
                <button
                  type="button"
                  onClick={() => setArchiveConfirm(false)}
                  className="text-muted-foreground underline cursor-pointer"
                >
                  Нет
                </button>
              </span>
            )}
          </div>

          {blockError && (
            <p className="text-[11px] text-destructive">Блокировка: {blockError}</p>
          )}
          {archiveError && (
            <p className="text-[11px] text-destructive">Архив: {archiveError}</p>
          )}

          <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>
            «Ограничить доступ» → POST /block · «В архив» → PATCH /archive. Оптимистичное обновление с rollback.
          </p>
        </SectionCard>

        {/* ── 7. Администрирование ─────────────────────────────────── */}
        <SectionCard title="Администрирование">
          {/* Technical IDs */}
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Технические идентификаторы
          </p>
          <table className="w-full border-separate border-spacing-0 mb-1">
            <tbody>
              <KVRow label="ID пациента">
                <span className="font-mono text-[11px]">
                  {userId.slice(0, 12)}…{userId.slice(-4)}{" "}
                  <button
                    type="button"
                    title="Скопировать"
                    onClick={() => copyText(userId)}
                    className="inline-flex h-4 w-4 items-center justify-center rounded border border-border bg-muted/30 text-[10px] hover:bg-muted cursor-pointer ml-0.5 align-middle"
                  >
                    ⧉
                  </button>
                </span>
              </KVRow>
              <KVRow label="Rubitime ID">
                {/* TODO(backend): rubitime_id not in PatientCardHeader; would come from ClientIdentity */}
                <span className="font-mono text-[11px] text-muted-foreground">—</span>
              </KVRow>
              {telegramId && (
                <KVRow label="Telegram ID">
                  <span className="font-mono text-[11px]">{telegramId}</span>
                </KVRow>
              )}
              <KVRow label="Регистрация">
                {/* TODO(backend): identity.createdAt not in PatientCardHeader; available in ClientIdentity */}
                <span className="text-muted-foreground">—</span>
              </KVRow>
            </tbody>
          </table>

          {/* Merge — existing AdminMergeAccountsPanel (same usage as DoctorClientCardAdminSection) */}
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Объединение (merge)
          </p>
          <AdminMergeAccountsPanel
            anchorUserId={userId}
            enabled
            suspendHeavyFetch={!active}
          />

          {/* Audit log — AdminClientAuditHistorySection (handles 403 gracefully) */}
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-2">
            История изменений (audit)
          </p>
          <AdminClientAuditHistorySection
            platformUserId={userId}
            enabled
            suspendLoad={!active}
          />

          <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>
            Merge требует роль admin; компонент обрабатывает 403 сам.
            Audit выдаёт «нет роли» при 403 без краша.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
