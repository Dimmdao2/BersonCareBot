"use client";

/**
 * PatientCardClient — Wave 2: real header + 6-tab client-side navigation.
 * Tabs are rendered once and shown/hidden client-side (no server re-fetch per tab).
 *
 * Header: FIO display with inline edit. All other editing lives in the «Учётка» tab.
 */
import { use, useState, useEffect } from "react";
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
  doctorSectionSubtitleClass,
  doctorMetricLabelClass,
} from "@/shared/ui/doctor/doctorVisual";
import { cn } from "@/lib/utils";
import { MessageSquare, Send, Smartphone, Mail, Pencil, X, Check } from "lucide-react";
import { formatFioForDoctor } from "@/lib/parseFullName";
import { PatientTabOverview } from "./tabs/PatientTabOverview";
import { PatientTabKarta } from "./tabs/PatientTabKarta";
import { PatientTabProgram } from "./tabs/PatientTabProgram";
import { PatientTabRecords } from "./tabs/PatientTabRecords";
import { PatientTabFiles } from "./tabs/PatientTabFiles";
import { PatientTabAccount } from "./tabs/PatientTabAccount";
import { PatientTabComms } from "./tabs/PatientTabComms";

type Props = {
  cardHeaderPromise: Promise<PatientCardHeader | null>;
  initialTab?: string;
  createVisitFrom?: string;
};

type TabId = "overview" | "karta" | "program" | "records" | "files" | "account" | "comms";

const PATIENT_TABS: Array<{ id: TabId; label: string; badge?: number }> = [
  { id: "overview", label: "Обзор" },
  { id: "karta", label: "Карточка" },
  { id: "program", label: "Программа" },
  { id: "records", label: "Визиты" },
  { id: "files", label: "Файлы" },
  { id: "comms", label: "Коммуникации" },
  { id: "account", label: "Учётка" },
];

/** Format ISO date → DD.MM.YYYY */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Format ISO date → DD.MM (short, for next appointment date column) */
function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

/** Copy text to clipboard */
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // fallback: silent
  }
}

/** Format ISO date yyyy-mm-dd → DD.MM.YYYY */
function fmtBirthDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return "—";
  return `${day}.${month}.${year}`;
}

export function PatientCardClient({ cardHeaderPromise, initialTab, createVisitFrom }: Props) {
  const header = use(cardHeaderPromise);
  const resolvedInitialTab: TabId =
    initialTab && PATIENT_TABS.some((t) => t.id === initialTab) ? (initialTab as TabId) : "overview";
  const [activeTab, setActiveTab] = useState<TabId>(resolvedInitialTab);
  const [pendingAppointmentId, setPendingAppointmentId] = useState<string | null>(
    createVisitFrom ?? null,
  );

  // FIO inline edit state
  const [fioEditing, setFioEditing] = useState(false);
  const [fioSaving, setFioSaving] = useState(false);
  const [fioError, setFioError] = useState<string | null>(null);
  // Local overrides applied after a successful save (avoids full page reload)
  const [fioOverride, setFioOverride] = useState<{
    firstName: string | null;
    lastName: string | null;
    patronymic: string | null;
    displayName?: string | null;
    birthDate?: string | null;
    gender?: "male" | "female" | null;
  } | null>(null);
  // Draft input values
  const [fioLastName, setFioLastName] = useState("");
  const [fioFirstName, setFioFirstName] = useState("");
  const [fioPatronymic, setFioPatronymic] = useState("");
  const [fioDisplayName, setFioDisplayName] = useState("");
  const [fioBirthDate, setFioBirthDate] = useState("");
  const [fioGender, setFioGender] = useState<"male" | "female" | "">("");

  // Auto-switch to karta tab when opening with createVisitFrom URL param
  useEffect(() => {
    if (createVisitFrom) setActiveTab("karta");
  }, [createVisitFrom]);

  // Listen for cross-tab navigation events dispatched by child tabs (e.g. «Оформить визит» → Карта)
  useEffect(() => {
    function handleOpenTab(e: Event) {
      const tab = (e as CustomEvent<{ tab: string }>).detail?.tab as TabId | undefined;
      if (tab && PATIENT_TABS.some((t) => t.id === tab)) {
        setActiveTab(tab);
      }
    }
    window.addEventListener("patient:open-tab", handleOpenTab);
    return () => window.removeEventListener("patient:open-tab", handleOpenTab);
  }, []);

  if (!header) {
    return (
      <div className={doctorSectionCardClass}>
        <p className="text-sm text-muted-foreground">Пациент не найден.</p>
      </div>
    );
  }

  const { identity, support, lastVisit, nextAppointment, totalVisits, cancellationsCount, reschedulesCount, firstVisitDate } = header;

  // Resolved FIO: local override wins over server data
  const resolvedFirstName = fioOverride ? fioOverride.firstName : identity.firstName;
  const resolvedLastName = fioOverride ? fioOverride.lastName : identity.lastName;
  const resolvedPatronymic = fioOverride ? fioOverride.patronymic : identity.patronymic;
  const resolvedDisplayName =
    fioOverride?.displayName !== undefined ? fioOverride.displayName : identity.displayName;
  const resolvedBirthDate =
    fioOverride?.birthDate !== undefined ? fioOverride.birthDate : identity.birthDate;
  const resolvedGender =
    fioOverride?.gender !== undefined ? fioOverride.gender : identity.gender;
  const fioDisplay = formatFioForDoctor(resolvedLastName, resolvedFirstName, resolvedPatronymic);
  const hasFio = Boolean(resolvedFirstName || resolvedLastName || resolvedPatronymic);

  function openFioEdit() {
    setFioLastName(resolvedLastName ?? "");
    setFioFirstName(resolvedFirstName ?? "");
    setFioPatronymic(resolvedPatronymic ?? "");
    setFioDisplayName(resolvedDisplayName ?? "");
    setFioBirthDate(resolvedBirthDate ?? "");
    setFioGender(resolvedGender ?? "");
    setFioError(null);
    setFioEditing(true);
  }

  function cancelFioEdit() {
    setFioEditing(false);
    setFioError(null);
  }

  async function saveFio() {
    setFioSaving(true);
    setFioError(null);
    try {
      const res = await fetch(`/api/doctor/patients/${identity.userId}/fio`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lastName: fioLastName.trim() || null,
          firstName: fioFirstName.trim() || null,
          patronymic: fioPatronymic.trim() || null,
          displayName: fioDisplayName.trim() || undefined,
          birthDate: fioBirthDate.trim() || null,
          gender: fioGender || null,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setFioError((json as { error?: string })?.error ?? "Ошибка сохранения");
        return;
      }
      // Apply local override to avoid page reload
      setFioOverride({
        lastName: fioLastName.trim() || null,
        firstName: fioFirstName.trim() || null,
        patronymic: fioPatronymic.trim() || null,
        displayName: fioDisplayName.trim() || null,
        birthDate: fioBirthDate.trim() || null,
        gender: fioGender || null,
      });
      setFioEditing(false);
    } catch {
      setFioError("Ошибка сети");
    } finally {
      setFioSaving(false);
    }
  }

  /** Active age: from resolved birthDate (override wins) */
  const activeAge: number | null = (() => {
    if (!resolvedBirthDate) return null;
    const today = new Date();
    const bd = new Date(resolvedBirthDate);
    let age = today.getFullYear() - bd.getFullYear();
    const m = today.getMonth() - bd.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
    return age >= 0 ? age : null;
  })();

  const hasTelegram = Boolean(identity.bindings.telegramId);
  const hasMax = Boolean(identity.bindings.maxId);
  const hasEmail = Boolean(identity.email);
  // Chat is available if any messaging channel is bound
  const hasChat = hasTelegram || hasMax;

  return (
    <div className="flex flex-col gap-3">
      {/* ================================================================
          IDENTITY HEADER CARD — READ ONLY
          Displaying patient identity; all edits live in «Учётка» tab.
      ================================================================ */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Main header body */}
        <div className="px-4 pt-3.5 pb-2.5 flex flex-wrap gap-3.5 items-start">

          {/* LEFT: identity */}
          <div className="flex-1 min-w-[280px] flex flex-col gap-0">
            {/* FIO (primary) + edit button + support chip */}
            <div className="flex items-start gap-2 flex-wrap">
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                {/* FIO row */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-base font-bold text-foreground leading-tight">
                    {hasFio ? fioDisplay : (identity.displayName || "—")}
                  </span>
                  <button
                    type="button"
                    title="Редактировать ФИО"
                    onClick={openFioEdit}
                    className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer shrink-0"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>

                {/* displayName as secondary label (отображаемое имя) */}
                {hasFio && resolvedDisplayName && (
                  <div className={cn(doctorSectionSubtitleClass, "mt-0 text-xs text-muted-foreground/70")}>
                    отобр.: {resolvedDisplayName}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap shrink-0">
                {support.isOnSupport && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    ★ На сопровождении
                    {support.supportMonthsApprox != null && (
                      <> · {support.supportMonthsApprox} мес</>
                    )}
                  </span>
                )}
                {identity.isArchived && (
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Архив
                  </span>
                )}
                {identity.isBlocked && (
                  <span className="inline-flex items-center rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                    Заблокирован
                  </span>
                )}
              </div>
            </div>

            {/* Inline FIO edit form */}
            {fioEditing && (
              <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-border bg-muted/30 p-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Фамилия</label>
                    <input
                      type="text"
                      value={fioLastName}
                      onChange={(e) => setFioLastName(e.target.value)}
                      placeholder="Иванов"
                      className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Имя</label>
                    <input
                      type="text"
                      value={fioFirstName}
                      onChange={(e) => setFioFirstName(e.target.value)}
                      placeholder="Иван"
                      className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Отчество</label>
                    <input
                      type="text"
                      value={fioPatronymic}
                      onChange={(e) => setFioPatronymic(e.target.value)}
                      placeholder="Иванович"
                      className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Отображаемое имя</label>
                  <input
                    type="text"
                    value={fioDisplayName}
                    onChange={(e) => setFioDisplayName(e.target.value)}
                    placeholder="Как обращаться к пациенту"
                    className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Дата рождения</label>
                    <input
                      type="date"
                      value={fioBirthDate}
                      onChange={(e) => setFioBirthDate(e.target.value)}
                      className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Пол</label>
                    <select
                      value={fioGender}
                      onChange={(e) => setFioGender(e.target.value as "male" | "female" | "")}
                      className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="">Не указан</option>
                      <option value="female">Женский</option>
                      <option value="male">Мужской</option>
                    </select>
                  </div>
                </div>
                {fioError && (
                  <p className="text-xs text-destructive">{fioError}</p>
                )}
                <div className="flex gap-2 mt-0.5">
                  <button
                    type="button"
                    onClick={saveFio}
                    disabled={fioSaving}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 cursor-pointer transition-colors"
                  >
                    <Check className="h-3 w-3" />
                    {fioSaving ? "Сохранение…" : "Сохранить"}
                  </button>
                  <button
                    type="button"
                    onClick={cancelFioEdit}
                    disabled={fioSaving}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/60 disabled:opacity-60 cursor-pointer transition-colors"
                  >
                    <X className="h-3 w-3" />
                    Отмена
                  </button>
                </div>
              </div>
            )}

            {/* ДР · возраст — read-only; edit via pencil */}
            <div className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
              <span>
                ДР:{" "}
                {resolvedBirthDate ? (
                  <>{fmtBirthDate(resolvedBirthDate)}{activeAge != null ? ` · ${activeAge} лет` : ""}</>
                ) : (
                  "—"
                )}
              </span>
            </div>

            {/* Пол — read-only; edit via pencil */}
            <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
              <span>
                Пол: {resolvedGender === "male" ? "М" : resolvedGender === "female" ? "Ж" : "—"}
              </span>
            </div>

            {/* Phone + channel icons */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {identity.phone ? (
                <button
                  type="button"
                  title="Скопировать телефон"
                  onClick={() => copyToClipboard(identity.phone!)}
                  className="font-mono text-xs text-foreground hover:text-primary transition-colors cursor-pointer select-text"
                >
                  {identity.phone} ⧉
                </button>
              ) : (
                <span className="text-xs text-muted-foreground font-mono">—</span>
              )}

              {/* Channel icon buttons — lucide-react icons; active = colored, inactive = muted */}
              <span className="flex gap-1">
                <button
                  type="button"
                  title="Открыть чат"
                  disabled={!hasChat}
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-md border text-xs transition-colors",
                    hasChat
                      ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/15 cursor-pointer"
                      : "border-transparent bg-muted/30 text-muted-foreground/40 cursor-not-allowed",
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Telegram"
                  disabled={!hasTelegram}
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-md border text-xs transition-colors",
                    hasTelegram
                      ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/15 cursor-pointer"
                      : "border-transparent bg-muted/30 text-muted-foreground/40 cursor-not-allowed",
                  )}
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="MAX"
                  disabled={!hasMax}
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-md border text-xs transition-colors",
                    hasMax
                      ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/15 cursor-pointer"
                      : "border-transparent bg-muted/30 text-muted-foreground/40 cursor-not-allowed",
                  )}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Написать email"
                  disabled={!hasEmail}
                  onClick={() => hasEmail && (window.location.href = `mailto:${identity.email}`)}
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-md border text-xs transition-colors",
                    hasEmail
                      ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/15 cursor-pointer"
                      : "border-transparent bg-muted/30 text-muted-foreground/40 cursor-not-allowed",
                  )}
                >
                  <Mail className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
          </div>

          {/* RIGHT: mini-summary stats */}
          <div className="flex gap-4 items-start pt-0.5 shrink-0">
            {/* Прошлый визит */}
            <div className="flex flex-col gap-0.5">
              <span className={cn(doctorMetricLabelClass, "text-[10px]")}>Прошлый визит</span>
              <span className="text-sm font-semibold text-foreground">
                {lastVisit ? fmtDate(lastVisit.date) : "—"}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {lastVisit
                  ? [lastVisit.visitType, lastVisit.city].filter(Boolean).join(" · ") || "—"
                  : "нет данных"}
              </span>
            </div>

            {/* Следующая запись */}
            <div className="flex flex-col gap-0.5">
              <span className={cn(doctorMetricLabelClass, "text-[10px]")}>Следующая запись</span>
              <span className="text-sm font-semibold text-foreground">
                {nextAppointment
                  ? `${fmtDateShort(nextAppointment.date)} · ${nextAppointment.time}`
                  : "—"}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {nextAppointment
                  ? [nextAppointment.appointmentType, nextAppointment.city].filter(Boolean).join(" · ") || "—"
                  : "нет записи"}
              </span>
            </div>

            {/* Визитов */}
            <div className="flex flex-col gap-0.5 cursor-pointer" title="Детали: отмены, переносы">
              <span className={cn(doctorMetricLabelClass, "text-[10px]")}>Визитов</span>
              <span className="text-sm font-semibold text-foreground">{totalVisits}</span>
              <span className="text-[11px] text-muted-foreground">
                {firstVisitDate ? `с ${fmtDateShort(firstVisitDate)}` : ""}
                {" · "}
                <span className="text-primary">детали ▾</span>
              </span>
            </div>
          </div>
        </div>

        {/* ================================================================
            TAB STRIP (.ptabs equivalent)
            6 tabs: Обзор · Карта · Программа · Записи · Файлы · Учётка
            Client-side switching via useState (no server re-fetch)
        ================================================================ */}
        <div className="px-4 py-2 border-t border-border/60 bg-muted/20">
          <div className="flex gap-0.5 flex-wrap">
            {PATIENT_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-3 py-1 text-sm font-medium transition-colors select-none cursor-pointer",
                  activeTab === tab.id
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {tab.label}
                {tab.badge != null && (
                  <span
                    className={cn(
                      "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
                      activeTab === tab.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ================================================================
          TAB PANELS — rendered once, hidden when not active.
      ================================================================ */}
      <div className={cn(activeTab !== "overview" && "hidden")}>
        <PatientTabOverview
          userId={identity.userId}
          header={header}
          onTabSwitch={(tab) => setActiveTab(tab as TabId)}
        />
      </div>
      <div className={cn(activeTab !== "karta" && "hidden")}>
        <PatientTabKarta
          userId={identity.userId}
          header={header}
          pendingAppointmentId={pendingAppointmentId}
          onPendingConsumed={() => setPendingAppointmentId(null)}
        />
      </div>
      <div className={cn(activeTab !== "program" && "hidden")}>
        <PatientTabProgram userId={identity.userId} header={header} active={activeTab === "program"} />
      </div>
      <div className={cn(activeTab !== "records" && "hidden")}>
        <PatientTabRecords
          userId={identity.userId}
          header={header}
          onCreateVisitFromAppointment={(apptId) => {
            setPendingAppointmentId(apptId);
            setActiveTab("karta");
          }}
        />
      </div>
      <div className={cn(activeTab !== "files" && "hidden")}>
        <PatientTabFiles userId={identity.userId} header={header} />
      </div>
      <div className={cn(activeTab !== "account" && "hidden")}>
        <PatientTabAccount userId={identity.userId} header={header} active={activeTab === "account"} />
      </div>
      <div className={cn(activeTab !== "comms" && "hidden")}>
        <PatientTabComms userId={identity.userId} />
      </div>
    </div>
  );
}
