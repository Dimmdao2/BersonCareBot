"use client";

/**
 * PatientCardClient — Wave 2: real header + 6-tab client-side navigation.
 * Tabs are rendered once and shown/hidden client-side (no server re-fetch per tab).
 *
 * Header: FIO display with inline edit. All other editing lives in the «Учётка» tab.
 */
import { useState, useEffect, type ReactNode } from "react";
import type { PatientCardHeader, PatientAppointmentItem } from "@/modules/doctor-clients/ports";
import type { ClinicalState, Visit } from "@/modules/patient-clinical/ports";
import type { DoctorNoteRow } from "@/modules/doctor-notes/ports";
import type { SpecialistTaskRow } from "@/modules/specialist-tasks/types";
import type { ProactiveInsightRow } from "@/modules/doctor-proactive-insights/types";
import type { DoctorPatientProgramActivity } from "../loadDoctorPatientProgramActivity";
import type { TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
  doctorSectionSubtitleClass,
  doctorMetricLabelClass,
} from "@/shared/ui/doctor/doctorVisual";
import { cn } from "@/lib/utils";
import { MessageSquare, Send, Smartphone, Mail, Pencil, X, Check, Scale } from "lucide-react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/doctor/primitives/select";
import { formatFioForDoctor } from "@/lib/parseFullName";
import { PatientTabOverview } from "./tabs/PatientTabOverview";
import { PatientTabKarta } from "./tabs/PatientTabKarta";
import { PatientTabProgram } from "./tabs/PatientTabProgram";
import { PatientTabRecords } from "./tabs/PatientTabRecords";
import { PatientTabFiles } from "./tabs/PatientTabFiles";
import { PatientTabAccount } from "./tabs/PatientTabAccount";
import { PatientTabComms } from "./tabs/PatientTabComms";
import { PatientTabFinances } from "./tabs/PatientTabFinances";

type Props = {
  cardHeader: PatientCardHeader | null;
  initialTab?: string;
  createVisitFrom?: string;
  visitDate?: string;
  /** SSR-provided physical data (рост/вес) — skips client fetch when present. */
  initialPhysicalData?: { heightCm: number | null; weightKg: number | null } | null;
  /** When set, renders this node in place of PatientTabProgram in the Программа tab. */
  embeddedProgramContent?: ReactNode;
  initialClinicalState?: ClinicalState | null;
  initialVisits?: Visit[] | null;
  initialNotes?: DoctorNoteRow[] | null;
  initialTasks?: SpecialistTaskRow[] | null;
  initialSignals?: ProactiveInsightRow[] | null;
  initialProgramActivity?: DoctorPatientProgramActivity | null;
  initialAppointments?: PatientAppointmentItem[] | null;
  initialProgramInstances?: TreatmentProgramInstanceSummary[] | null;
};

type TabId = "overview" | "karta" | "program" | "records" | "files" | "account" | "comms" | "finances";

const PATIENT_TABS: Array<{ id: TabId; label: string; badge?: number }> = [
  { id: "overview", label: "Обзор" },
  { id: "karta", label: "Карточка" },
  { id: "program", label: "Программа" },
  { id: "records", label: "Визиты" },
  { id: "files", label: "Файлы" },
  { id: "comms", label: "Коммуникации" },
  { id: "finances", label: "Финансы" },
  { id: "account", label: "Учётка" },
];

/** Format ISO date → DD.MM.YYYY */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Format ISO date → DD.MM (short, for next appointment date column) */
function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit" });
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

export function PatientCardClient({ cardHeader, initialTab, createVisitFrom, visitDate, initialPhysicalData, embeddedProgramContent, initialClinicalState, initialVisits, initialNotes, initialTasks, initialSignals, initialProgramActivity, initialAppointments, initialProgramInstances }: Props) {
  const header = cardHeader;
  const resolvedInitialTab: TabId =
    initialTab && PATIENT_TABS.some((t) => t.id === initialTab) ? (initialTab as TabId) : "overview";
  const [activeTab, setActiveTab] = useState<TabId>(resolvedInitialTab);
  const [pendingAppointmentId, setPendingAppointmentId] = useState<string | null>(
    createVisitFrom ?? null,
  );
  const [pendingVisitDate, setPendingVisitDate] = useState<string | null>(visitDate ?? null);

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

  // Physical data (рост / вес) state — initialPhysicalData SSR wins, else client-fetch
  const [physicalLoaded, setPhysicalLoaded] = useState(initialPhysicalData != null);
  const [physicalHeightCm, setPhysicalHeightCm] = useState<number | null>(initialPhysicalData?.heightCm ?? null);
  const [physicalWeightKg, setPhysicalWeightKg] = useState<number | null>(initialPhysicalData?.weightKg ?? null);
  const [physicalEditing, setPhysicalEditing] = useState(false);
  const [physicalSaving, setPhysicalSaving] = useState(false);
  const [physicalError, setPhysicalError] = useState<string | null>(null);
  // Draft values while editing (string so empty input is allowed)
  const [draftHeightCm, setDraftHeightCm] = useState("");
  const [draftWeightKg, setDraftWeightKg] = useState("");

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

  // Fetch physical data (рост/вес) only when not SSR-provided
  useEffect(() => {
    if (initialPhysicalData != null) return; // SSR data already loaded
    if (!header) return;
    const userId = header.identity.userId;
    fetch(`/api/doctor/patients/${userId}/physical`)
      .then((r) => r.json())
      .then((data: { ok: boolean; heightCm?: number | null; weightKg?: number | null }) => {
        if (data.ok) {
          setPhysicalHeightCm(data.heightCm ?? null);
          setPhysicalWeightKg(data.weightKg ?? null);
        }
        setPhysicalLoaded(true);
      })
      .catch(() => setPhysicalLoaded(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [header?.identity.userId]);

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

  /** Open inline physical edit form with current values pre-filled */
  function openPhysicalEdit() {
    setDraftHeightCm(physicalHeightCm != null ? String(physicalHeightCm) : "");
    setDraftWeightKg(physicalWeightKg != null ? String(physicalWeightKg) : "");
    setPhysicalError(null);
    setPhysicalEditing(true);
  }

  function cancelPhysicalEdit() {
    setPhysicalEditing(false);
    setPhysicalError(null);
  }

  async function savePhysical() {
    setPhysicalSaving(true);
    setPhysicalError(null);

    const heightVal = draftHeightCm.trim() === "" ? null : parseInt(draftHeightCm.trim(), 10);
    const weightVal = draftWeightKg.trim() === "" ? null : parseInt(draftWeightKg.trim(), 10);

    if (heightVal !== null && (isNaN(heightVal) || heightVal < 50 || heightVal > 250)) {
      setPhysicalError("Рост должен быть от 50 до 250 см");
      setPhysicalSaving(false);
      return;
    }
    if (weightVal !== null && (isNaN(weightVal) || weightVal < 10 || weightVal > 500)) {
      setPhysicalError("Вес должен быть от 10 до 500 кг");
      setPhysicalSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/doctor/patients/${identity.userId}/physical`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heightCm: heightVal, weightKg: weightVal }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setPhysicalError((json as { error?: string })?.error ?? "Ошибка сохранения");
        return;
      }
      // Optimistic update
      setPhysicalHeightCm(heightVal);
      setPhysicalWeightKg(weightVal);
      setPhysicalEditing(false);
    } catch {
      setPhysicalError("Ошибка сети");
    } finally {
      setPhysicalSaving(false);
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
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Редактировать ФИО"
                    onClick={openFioEdit}
                    className="h-5 w-5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 shrink-0"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
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
                    <Select
                      value={fioGender || "__none__"}
                      onValueChange={(v) => setFioGender(v === "__none__" ? "" : v as "male" | "female")}
                    >
                      <SelectTrigger
                        className="h-8 text-sm w-[120px]"
                        displayLabel={fioGender === "male" ? "Мужской" : fioGender === "female" ? "Женский" : "Не указан"}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Не указан</SelectItem>
                        <SelectItem value="female">Женский</SelectItem>
                        <SelectItem value="male">Мужской</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {fioError && (
                  <p className="text-xs text-destructive">{fioError}</p>
                )}
                <div className="flex gap-2 mt-0.5">
                  <Button
                    variant="default"
                    onClick={saveFio}
                    disabled={fioSaving}
                    className="h-auto gap-1 rounded-md px-3 py-1 text-xs font-medium disabled:opacity-60"
                  >
                    <Check className="h-3 w-3" />
                    {fioSaving ? "Сохранение…" : "Сохранить"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={cancelFioEdit}
                    disabled={fioSaving}
                    className="h-auto gap-1 rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/60 disabled:opacity-60"
                  >
                    <X className="h-3 w-3" />
                    Отмена
                  </Button>
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

            {/* Рост / Вес — read-only with inline edit (OBZ-11) */}
            {physicalLoaded && (
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">
                  {physicalHeightCm != null && physicalWeightKg != null
                    ? `${physicalHeightCm} см · ${physicalWeightKg} кг`
                    : physicalHeightCm != null
                    ? `${physicalHeightCm} см`
                    : physicalWeightKg != null
                    ? `${physicalWeightKg} кг`
                    : "Рост/вес: —"}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Редактировать рост и вес"
                  onClick={openPhysicalEdit}
                  className="h-5 w-5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 shrink-0"
                >
                  <Scale className="h-3 w-3" />
                </Button>
              </div>
            )}

            {/* Inline physical edit form */}
            {physicalEditing && (
              <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-border bg-muted/30 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Рост (см)</label>
                    <input
                      type="number"
                      min={50}
                      max={250}
                      step={1}
                      value={draftHeightCm}
                      onChange={(e) => setDraftHeightCm(e.target.value)}
                      placeholder="напр. 175"
                      className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Вес (кг)</label>
                    <input
                      type="number"
                      min={10}
                      max={500}
                      step={1}
                      value={draftWeightKg}
                      onChange={(e) => setDraftWeightKg(e.target.value)}
                      placeholder="напр. 70"
                      className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
                {physicalError && (
                  <p className="text-xs text-destructive">{physicalError}</p>
                )}
                <div className="flex gap-2 mt-0.5">
                  <Button
                    variant="default"
                    onClick={savePhysical}
                    disabled={physicalSaving}
                    className="h-auto gap-1 rounded-md px-3 py-1 text-xs font-medium disabled:opacity-60"
                  >
                    <Check className="h-3 w-3" />
                    {physicalSaving ? "Сохранение…" : "Сохранить"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={cancelPhysicalEdit}
                    disabled={physicalSaving}
                    className="h-auto gap-1 rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/60 disabled:opacity-60"
                  >
                    <X className="h-3 w-3" />
                    Отмена
                  </Button>
                </div>
              </div>
            )}

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
                <Button
                  variant="ghost"
                  size="icon"
                  title="Открыть чат"
                  disabled={!hasChat}
                  className={cn(
                    "h-6 w-6 rounded-md border text-xs",
                    hasChat
                      ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/15"
                      : "border-transparent bg-muted/30 text-muted-foreground/40",
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Telegram"
                  disabled={!hasTelegram}
                  className={cn(
                    "h-6 w-6 rounded-md border text-xs",
                    hasTelegram
                      ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/15"
                      : "border-transparent bg-muted/30 text-muted-foreground/40",
                  )}
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="MAX"
                  disabled={!hasMax}
                  className={cn(
                    "h-6 w-6 rounded-md border text-xs",
                    hasMax
                      ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/15"
                      : "border-transparent bg-muted/30 text-muted-foreground/40",
                  )}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Написать email"
                  disabled={!hasEmail}
                  onClick={() => hasEmail && (window.location.href = `mailto:${identity.email}`)}
                  className={cn(
                    "h-6 w-6 rounded-md border text-xs",
                    hasEmail
                      ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/15"
                      : "border-transparent bg-muted/30 text-muted-foreground/40",
                  )}
                >
                  <Mail className="h-3.5 w-3.5" />
                </Button>
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
              <Button
                key={tab.id}
                variant="ghost"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "h-auto gap-1 rounded-md px-3 py-1 text-sm font-medium",
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
              </Button>
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
          initialClinicalState={initialClinicalState}
          initialVisits={initialVisits}
          initialNotes={initialNotes}
          initialTasks={initialTasks}
          initialSignals={initialSignals}
          initialProgramActivity={initialProgramActivity}
          initialAppointments={initialAppointments}
        />
      </div>
      <div className={cn(activeTab !== "karta" && "hidden")}>
        <PatientTabKarta
          userId={identity.userId}
          header={header}
          pendingAppointmentId={pendingAppointmentId}
          pendingVisitDate={pendingVisitDate}
          onPendingConsumed={() => {
            setPendingAppointmentId(null);
            setPendingVisitDate(null);
          }}
          initialClinicalState={initialClinicalState}
          initialVisits={initialVisits}
        />
      </div>
      <div className={cn(activeTab !== "program" && "hidden")}>
        {embeddedProgramContent ?? (
          <PatientTabProgram userId={identity.userId} header={header} active={activeTab === "program"} initialProgramInstances={initialProgramInstances} />
        )}
      </div>
      <div className={cn(activeTab !== "records" && "hidden")}>
        <PatientTabRecords
          userId={identity.userId}
          header={header}
          onCreateVisitFromAppointment={(apptId) => {
            setPendingAppointmentId(apptId);
            setActiveTab("karta");
          }}
          initialAppointments={initialAppointments}
        />
      </div>
      <div className={cn(activeTab !== "files" && "hidden")}>
        <PatientTabFiles userId={identity.userId} header={header} />
      </div>
      <div className={cn(activeTab !== "account" && "hidden")}>
        <PatientTabAccount userId={identity.userId} header={header} active={activeTab === "account"} />
      </div>
      <div className={cn(activeTab !== "comms" && "hidden")}>
        <PatientTabComms userId={identity.userId} initialProgramInstances={initialProgramInstances} />
      </div>
      <div className={cn(activeTab !== "finances" && "hidden")}>
        <PatientTabFinances userId={identity.userId} />
      </div>
    </div>
  );
}
