"use client";

/**
 * PatientTabAccount — S2.5 cleaned-up version.
 *
 * Kept:
 *  1. Личные данные     — READ-ONLY (edit form moved to header, S4.1)
 *  2. Контакты и каналы — channels (phone, telegram, email, MAX)
 *  3. Блокировки и доступ — POST /api/doctor/clients/{userId}/block
 *  4. Архив             — PATCH /api/doctor/clients/{userId}/archive
 *  5. Администрирование — AdminMergeAccountsPanel (collapsed by default) + audit log
 *
 * Removed from here (moved to other tabs):
 *  - Сопровождение → PatientTabOverview
 *  - Платежи       → PatientTabRecords
 *  - Репутация записи → PatientTabRecords already shows KPIs
 */

import { useEffect, useState } from "react";
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
import { Phone, Send, Smartphone, Mail, Key } from "lucide-react";
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
  doctorSectionSubtitleClass,
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
  /** SSR-provided supplementary contacts. When present, skips SecondaryPhones initial fetch. */
  initialSupplementaryContacts?: SupplementaryContact[] | null;
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function fmtBirthDateDisplay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return "—";
  return `${day}.${month}.${year}`;
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
  actionLabel,
  onAction,
  warning,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  status: "active" | "problem" | "none";
  actionLabel?: string;
  onAction?: () => void;
  warning?: boolean;
}) {
  const chipStyles =
    status === "active"
      ? "bg-primary/10 text-primary border border-primary/20"
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
      <span className={cn(
        "w-5 flex-none flex items-center justify-center",
        status === "active" ? "text-primary" : "text-muted-foreground",
      )}>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-mono leading-tight text-foreground truncate">{value}</div>
        <div className={cn(doctorSectionSubtitleClass, "text-[11px]")}>{hint ?? label}</div>
      </div>
      <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium", chipStyles)}>
        {chipText}
      </span>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex h-5 items-center justify-center rounded border border-border bg-muted/30 px-1.5 text-[10px] text-muted-foreground hover:bg-muted cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/**
 * Доп. телефоны пациента (платформенные доп. контакты, contact_type='phone').
 * Основной телефон не редактируется ни врачом, ни админом — здесь только ДОБАВЛЕНИЕ
 * вторичных номеров (owner-правило). Бэкенд: /api/doctor/clients/:id/supplementary-contacts.
 */
type SupplementaryContact = { id: string; contactType: string; value: string; source: string };

export type { SupplementaryContact };

function SecondaryPhones({
  userId,
  initialContacts,
}: {
  userId: string;
  /** SSR-provided contacts (all types). When present, skips the initial client fetch. */
  initialContacts?: SupplementaryContact[];
}) {
  // Filter to phones on init; client re-fetch returns all types so filter is applied there too.
  const [phones, setPhones] = useState<SupplementaryContact[] | null>(
    () => initialContacts != null ? initialContacts.filter((c) => c.contactType === "phone") : null,
  );
  const [error, setError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = () => {
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
  };

  useEffect(() => {
    // Skip initial fetch when SSR data provided; load() is still called after add/remove.
    if (initialContacts != null) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <span className="w-5 flex-none flex items-center justify-center text-muted-foreground">
            <Phone className="h-3.5 w-3.5" />
          </span>
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
                void add();
              } else if (e.key === "Escape") {
                setAdding(false);
              }
            }}
            placeholder="+7 999 000-00-00"
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => void add()}
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

/**
 * Смена email пациента. Врач НЕ может менять email (owner-правило) — эндпоинт admin-only.
 * Компонент сам определяет роль: GET /email-change возвращает 403 для врача (тогда ничего
 * не показываем) и 200 для админа.
 */
function EmailChange({ userId }: { userId: string }) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [pending, setPending] = useState<{ email: string; expiresAt: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/doctor/patients/${userId}/email-change`;

  useEffect(() => {
    let alive = true;
    fetch(base, { credentials: "include" })
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 403) {
          setIsAdmin(false);
          return;
        }
        if (!r.ok) {
          setIsAdmin(true);
          return;
        }
        const d = (await r.json()) as { pending: { email: string; expiresAt: string } | null };
        setIsAdmin(true);
        setPending(d.pending ?? null);
      })
      .catch(() => {
        if (alive) setIsAdmin(false);
      });
    return () => {
      alive = false;
    };
  }, [base]);

  if (isAdmin !== true) return null;

  const submit = async () => {
    const email = input.trim();
    if (!email) {
      setError("Введите email");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(base, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json().catch(() => null)) as
        | { pending?: { email: string; expiresAt: string }; error?: string; message?: string }
        | null;
      if (!res.ok) {
        setError(body?.message ?? (body?.error === "invalid_body" ? "Некорректный email" : "Не удалось"));
        return;
      }
      setPending(body?.pending ?? { email, expiresAt: "" });
      setInput("");
      setEditing(false);
    } catch {
      setError("Не удалось");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/10 px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <span className="w-5 flex-none flex items-center justify-center text-muted-foreground">
          <Key className="h-3.5 w-3.5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-foreground leading-tight">Смена email (админ)</div>
          {pending ? (
            <div className={cn(doctorSectionSubtitleClass, "text-[11px]")}>
              ожидает подтверждения пациентом: <span className="font-mono">{pending.email}</span>
            </div>
          ) : (
            <div className={cn(doctorSectionSubtitleClass, "text-[11px]")}>
              применится после подтверждения кодом пациентом
            </div>
          )}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex-none text-[11px] text-primary hover:underline cursor-pointer"
          >
            {pending ? "сменить другой" : "сменить email"}
          </button>
        )}
      </div>

      {editing && (
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            type="email"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              } else if (e.key === "Escape") setEditing(false);
            }}
            placeholder="новый email пациента"
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "…" : "Отправить код"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Отмена
          </button>
        </div>
      )}
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PatientTabAccount({ userId, header, active = false, initialSupplementaryContacts }: Props) {
  const identity = header?.identity;

  // Derived channel info from header
  const hasTelegram = Boolean(identity?.bindings?.telegramId);
  const hasMax = Boolean(identity?.bindings?.maxId);
  const hasEmail = Boolean(identity?.email);
  const telegramId = identity?.bindings?.telegramId ?? null;
  const maxId = identity?.bindings?.maxId ?? null;

  // Personal data — read-only display values from header
  const displayName = identity?.displayName ?? "";
  const firstName = identity?.firstName ?? null;
  const lastName = identity?.lastName ?? null;
  const birthDate = identity?.birthDate ?? null;
  const gender = identity?.gender ?? null;

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
  // Merge block collapse state
  // ---------------------------------------------------------------------------
  const [mergeOpen, setMergeOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr", alignItems: "start" }}>
      {/* ====================================================================
          LEFT COLUMN
      ==================================================================== */}
      <div className="flex flex-col gap-3">

        {/* ── 1. Личные данные (read-only) ─────────────────────────── */}
        <SectionCard
          title="Личные данные"
          titleRight={
            <span className={cn(doctorSectionSubtitleClass, "text-[11px]")}>
              редактирование — в заголовке карточки
            </span>
          }
        >
          <table className="w-full border-separate border-spacing-0">
            <tbody>
              {/* displayName — bold primary name */}
              <KVRow label="Отображаемое имя">
                <span className="font-semibold">{displayName || "—"}</span>
              </KVRow>
              {/* Hidden real name */}
              <KVRow label="ФИО (скрытое)">
                {(firstName || lastName) ? (
                  <span className="text-muted-foreground text-[11px]">
                    {[lastName, firstName].filter(Boolean).join(" ")}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-[11px]">не указано</span>
                )}
              </KVRow>
              {/* Phone */}
              <KVRow label="Телефон">
                {identity?.phone ? (
                  <button
                    type="button"
                    title="Скопировать"
                    onClick={() => void copyText(identity.phone!)}
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
              {/* Birth date */}
              <KVRow label="Дата рождения">
                <span>{fmtBirthDateDisplay(birthDate)}</span>
              </KVRow>
              {/* Gender */}
              <KVRow label="Пол">
                <span>
                  {gender === "male" ? "Мужской" : gender === "female" ? "Женский" : "—"}
                </span>
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
              icon={<Phone className="h-3.5 w-3.5" />}
              label="Телефон"
              value={identity?.phone ?? "—"}
              hint="основной телефон · не редактируется"
              status={identity?.phone ? "active" : "none"}
              actionLabel="⧉"
              onAction={() => void copyText(identity?.phone ?? "")}
            />

            {/* Доп. телефоны (основной не меняется; только добавление вторичных) */}
            <SecondaryPhones
              userId={userId}
              initialContacts={initialSupplementaryContacts ?? undefined}
            />

            {/* Telegram */}
            <ChannelRow
              icon={<Send className="h-3.5 w-3.5" />}
              label="Telegram"
              value={hasTelegram ? `id ${telegramId}` : "не привязан"}
              hint="Telegram"
              status={hasTelegram ? "active" : "none"}
            />

            {/* MAX */}
            <ChannelRow
              icon={<Smartphone className="h-3.5 w-3.5" />}
              label="MAX"
              value={hasMax ? `id ${maxId}` : "не привязан"}
              hint="MAX"
              status={hasMax ? "active" : "none"}
            />

            {/* Email */}
            {hasEmail ? (
              <ChannelRow
                icon={<Mail className="h-3.5 w-3.5" />}
                label="Email"
                value={identity?.email ?? "—"}
                hint="Email · статус неизвестен"
                status="problem"
                warning
                actionLabel="→"
                onAction={() => window.open(`mailto:${identity?.email}`, "_blank")}
              />
            ) : (
              <ChannelRow
                icon={<Mail className="h-3.5 w-3.5" />}
                label="Email"
                value="не указан"
                hint="Email"
                status="none"
              />
            )}

            {/* Смена email — только админ, применяется после подтверждения кодом пациентом */}
            <EmailChange userId={userId} />

            {/* PWA / App — скрыто до реализации backend (push/install status не отслеживается в текущей схеме) */}
          </div>
          <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>
            <span className="text-primary font-medium">подключён</span> → иконка активна и кликабельна ·{" "}
            <span className="text-destructive font-medium">проблема</span> — подсвечена.
          </p>
        </SectionCard>

      </div>

      {/* ====================================================================
          RIGHT COLUMN
      ==================================================================== */}
      <div className="flex flex-col gap-3">

        {/* ── 3. Блокировки и доступ ───────────────────────────────── */}
        <SectionCard title="Блокировки и доступ">
          <div className="flex flex-col gap-1.5">
            {/* Telegram bot status */}
            <div className={cn(doctorHistoryRowClass, "flex items-center gap-2 text-xs")}>
              <Send className={cn("h-3.5 w-3.5 flex-none", hasTelegram ? "text-primary" : "text-muted-foreground")} />
              <span className="flex-1">Telegram-бот</span>
              {hasTelegram ? (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
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
              <Smartphone className={cn("h-3.5 w-3.5 flex-none", hasMax ? "text-primary" : "text-muted-foreground")} />
              <span className="flex-1">{hasMax ? "MAX-бот" : "MAX-бот не привязан"}</span>
              {hasMax ? (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
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
                <span className="text-destructive flex-none font-bold">✕</span>
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
              {blockPending ? "…" : isBlocked ? "Снять блокировку" : "Ограничить доступ"}
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

        {/* ── 4. Администрирование ─────────────────────────────────── */}
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
                    onClick={() => void copyText(userId)}
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

          {/* Merge — collapsible, suspended until opened */}
          <details
            open={mergeOpen}
            onToggle={(e) => setMergeOpen((e.currentTarget as HTMLDetailsElement).open)}
            className="group"
          >
            <summary className="flex cursor-pointer list-none items-center gap-1 py-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground select-none">
                Объединение (merge)
              </p>
              <span className="ml-auto text-[10px] text-muted-foreground/60 select-none">
                {mergeOpen ? "▾" : "▸"}
              </span>
            </summary>
            <div className="mt-1">
              <AdminMergeAccountsPanel
                anchorUserId={userId}
                enabled
                suspendHeavyFetch={!active || !mergeOpen}
              />
            </div>
          </details>

          {/* Audit log — AdminClientAuditHistorySection (handles 403 gracefully) */}
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-2">
            История изменений (audit)
          </p>
          <AdminClientAuditHistorySection
            platformUserId={userId}
            enabled
            suspendLoad={!active}
          />

        </SectionCard>
      </div>
    </div>
  );
}
