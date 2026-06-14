"use client";

/**
 * PatientCardClient — Wave 2: real header + 6-tab client-side navigation.
 * Tabs are rendered once and shown/hidden client-side (no server re-fetch per tab).
 */
import { use, useState, useEffect, useRef } from "react";
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
  doctorSectionSubtitleClass,
  doctorMetricLabelClass,
} from "@/shared/ui/doctor/doctorVisual";
import { cn } from "@/lib/utils";
import { PatientTabOverview } from "./tabs/PatientTabOverview";
import { PatientTabKarta } from "./tabs/PatientTabKarta";
import { PatientTabProgram } from "./tabs/PatientTabProgram";
import { PatientTabRecords } from "./tabs/PatientTabRecords";
import { PatientTabFiles } from "./tabs/PatientTabFiles";
import { PatientTabAccount } from "./tabs/PatientTabAccount";

type Props = {
  cardHeaderPromise: Promise<PatientCardHeader | null>;
};

type TabId = "overview" | "karta" | "program" | "records" | "files" | "account";

const PATIENT_TABS: Array<{ id: TabId; label: string; badge?: number }> = [
  { id: "overview", label: "Обзор" },
  { id: "karta", label: "Карта" },
  { id: "program", label: "Программа" },
  { id: "records", label: "Записи" },
  { id: "files", label: "Файлы" },
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

export function PatientCardClient({ cardHeaderPromise }: Props) {
  const header = use(cardHeaderPromise);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // Inline birthDate editor state
  const [birthDateLocal, setBirthDateLocal] = useState<string | null | undefined>(undefined);
  const [editingBirthDate, setEditingBirthDate] = useState(false);
  const [bdInput, setBdInput] = useState("");
  const [bdSaving, setBdSaving] = useState(false);
  const bdInputRef = useRef<HTMLInputElement>(null);

  // Inline gender editor state
  const [genderLocal, setGenderLocal] = useState<"male" | "female" | null | undefined>(undefined);
  const [editingGender, setEditingGender] = useState(false);
  const [gSaving, setGSaving] = useState(false);

  // Sync from server header (once resolved)
  useEffect(() => {
    if (header && birthDateLocal === undefined) {
      setBirthDateLocal(header.identity.birthDate);
    }
  }, [header, birthDateLocal]);

  useEffect(() => {
    if (header && genderLocal === undefined) {
      setGenderLocal(header.identity.gender);
    }
  }, [header, genderLocal]);

  // Focus date input when editor opens
  useEffect(() => {
    if (editingBirthDate && bdInputRef.current) {
      bdInputRef.current.focus();
    }
  }, [editingBirthDate]);

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

  /** Active birthDate: from local edit state or header */
  const activeBirthDate = birthDateLocal !== undefined ? birthDateLocal : identity.birthDate;
  /** Active age: recompute from activeBirthDate */
  const activeAge: number | null = (() => {
    if (!activeBirthDate) return null;
    const today = new Date();
    const bd = new Date(activeBirthDate);
    let age = today.getFullYear() - bd.getFullYear();
    const m = today.getMonth() - bd.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
    return age >= 0 ? age : null;
  })();

  async function saveBirthDate() {
    const val = bdInput.trim() || null;
    // basic iso check
    if (val && !/^\d{4}-\d{2}-\d{2}$/.test(val)) return;
    setBdSaving(true);
    try {
      await fetch(`/api/doctor/patients/${identity.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthDate: val }),
      });
      setBirthDateLocal(val);
    } finally {
      setBdSaving(false);
      setEditingBirthDate(false);
    }
  }

  /** Active gender: from local edit state or header */
  const activeGender = genderLocal !== undefined ? genderLocal : identity.gender;

  async function saveGender(val: "male" | "female" | null) {
    setGSaving(true);
    try {
      await fetch(`/api/doctor/patients/${identity.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gender: val }),
      });
      setGenderLocal(val);
    } finally {
      setGSaving(false);
      setEditingGender(false);
    }
  }

  const hasTelegram = Boolean(identity.bindings.telegramId);
  const hasMax = Boolean(identity.bindings.maxId);
  const hasEmail = Boolean(identity.email);
  // Chat is available if any messaging channel is bound
  const hasChat = hasTelegram || hasMax;

  return (
    <div className="flex flex-col gap-3">
      {/* ================================================================
          IDENTITY HEADER CARD
          Faithful to wireframe lines 217–267:
          - displayName large + support chip
          - hidden real name (firstName + lastName) smaller below
          - ДР · возраст row (null → "—")
          - phone monospace + copy button + channel icons
          - right mini-summary (Прошлый визит / Следующая запись / Визитов)
      ================================================================ */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Main header body */}
        <div className="px-4 pt-3.5 pb-2.5 flex flex-wrap gap-3.5 items-start">

          {/* LEFT: identity */}
          <div className="flex-1 min-w-[280px] flex flex-col gap-0">
            {/* Display name + support chip */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-base font-bold text-foreground leading-tight">
                {identity.displayName}
              </span>
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

            {/* Hidden real name (owner answer #3): shown in smaller text under displayName */}
            {(identity.firstName || identity.lastName) && (
              <div className={cn(doctorSectionSubtitleClass, "mt-0.5 text-xs")}>
                {[identity.firstName, identity.lastName].filter(Boolean).join(" ")}
              </div>
            )}

            {/* ДР · возраст + inline editor */}
            <div className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
              {editingBirthDate ? (
                <>
                  <input
                    ref={bdInputRef}
                    type="date"
                    value={bdInput}
                    onChange={(e) => setBdInput(e.target.value)}
                    disabled={bdSaving}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { void saveBirthDate(); }
                      if (e.key === "Escape") { setEditingBirthDate(false); }
                    }}
                    className="h-6 rounded border border-border bg-background px-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => void saveBirthDate()}
                    disabled={bdSaving}
                    className="text-xs text-primary hover:underline disabled:opacity-50"
                  >
                    {bdSaving ? "…" : "Сохранить"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingBirthDate(false)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Отмена
                  </button>
                </>
              ) : (
                <>
                  <span>
                    ДР:{" "}
                    {activeBirthDate ? (
                      <>{fmtBirthDate(activeBirthDate)}{activeAge != null ? ` · ${activeAge} лет` : ""}</>
                    ) : (
                      "—"
                    )}
                  </span>
                  <button
                    type="button"
                    title="Указать дату рождения"
                    onClick={() => {
                      setBdInput(activeBirthDate ?? "");
                      setEditingBirthDate(true);
                    }}
                    className="inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    ✎
                  </button>
                </>
              )}
            </div>

            {/* Пол + inline editor */}
            <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
              {editingGender ? (
                <>
                  <span>Пол:</span>
                  <button
                    type="button"
                    onClick={() => void saveGender("male")}
                    disabled={gSaving}
                    className={cn(
                      "rounded border px-2 py-0.5 text-xs transition-colors disabled:opacity-50",
                      activeGender === "male"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-foreground hover:bg-muted",
                    )}
                  >
                    М
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveGender("female")}
                    disabled={gSaving}
                    className={cn(
                      "rounded border px-2 py-0.5 text-xs transition-colors disabled:opacity-50",
                      activeGender === "female"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-foreground hover:bg-muted",
                    )}
                  >
                    Ж
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveGender(null)}
                    disabled={gSaving}
                    className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    Сбросить
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingGender(false)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Отмена
                  </button>
                </>
              ) : (
                <>
                  <span>
                    Пол: {activeGender === "male" ? "М" : activeGender === "female" ? "Ж" : "—"}
                  </span>
                  <button
                    type="button"
                    title="Указать пол"
                    onClick={() => setEditingGender(true)}
                    className="inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    ✎
                  </button>
                </>
              )}
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

              {/* Channel icon buttons — active when binding present */}
              <span className="flex gap-1">
                <button
                  type="button"
                  title="Открыть чат"
                  disabled={!hasChat}
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-md border text-xs transition-colors",
                    hasChat
                      ? "border-border bg-background hover:bg-muted cursor-pointer"
                      : "border-transparent bg-muted/30 text-muted-foreground/40 cursor-not-allowed",
                  )}
                >
                  💬
                </button>
                <button
                  type="button"
                  title="Telegram"
                  disabled={!hasTelegram}
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-md border text-xs transition-colors",
                    hasTelegram
                      ? "border-border bg-background hover:bg-muted cursor-pointer"
                      : "border-transparent bg-muted/30 text-muted-foreground/40 cursor-not-allowed",
                  )}
                >
                  ✈️
                </button>
                <button
                  type="button"
                  title="MAX"
                  disabled={!hasMax}
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-md border text-xs transition-colors",
                    hasMax
                      ? "border-border bg-background hover:bg-muted cursor-pointer"
                      : "border-transparent bg-muted/30 text-muted-foreground/40 cursor-not-allowed",
                  )}
                >
                  Ⓜ️
                </button>
                <button
                  type="button"
                  title="Написать email"
                  disabled={!hasEmail}
                  onClick={() => hasEmail && (window.location.href = `mailto:${identity.email}`)}
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-md border text-xs transition-colors",
                    hasEmail
                      ? "border-border bg-background hover:bg-muted cursor-pointer"
                      : "border-transparent bg-muted/30 text-muted-foreground/40 cursor-not-allowed",
                  )}
                >
                  ✉️
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
          Wave 3 agents fill in real content per-tab file.
      ================================================================ */}
      <div className={cn(activeTab !== "overview" && "hidden")}>
        <PatientTabOverview userId={identity.userId} header={header} />
      </div>
      <div className={cn(activeTab !== "karta" && "hidden")}>
        <PatientTabKarta userId={identity.userId} header={header} />
      </div>
      <div className={cn(activeTab !== "program" && "hidden")}>
        <PatientTabProgram userId={identity.userId} header={header} />
      </div>
      <div className={cn(activeTab !== "records" && "hidden")}>
        <PatientTabRecords userId={identity.userId} header={header} />
      </div>
      <div className={cn(activeTab !== "files" && "hidden")}>
        <PatientTabFiles userId={identity.userId} header={header} />
      </div>
      <div className={cn(activeTab !== "account" && "hidden")}>
        <PatientTabAccount userId={identity.userId} header={header} />
      </div>
    </div>
  );
}
