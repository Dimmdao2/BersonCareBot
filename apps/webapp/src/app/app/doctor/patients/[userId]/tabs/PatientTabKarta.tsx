'use client';

/**
 * PatientTabKarta — clinical core («Карта»). Faithful to the wireframe
 * (docs/design/doctor-cabinet-wireframe.html #pp-karta + #visit-panel).
 *
 * Left column: Симптомы · Диагнозы · Анамнез.
 * Right column: История визитов feed (collapsible cards) + «+ Новый визит».
 * «+ Новый визит» opens the NewVisitPanel form.
 *
 * State matrix (panelOpen = add-visit form open; historyVisible = history shown):
 *
 * DEFAULT (!panelOpen):
 *   grid lg:grid-cols-[1.1fr_1fr] — full width, two balanced columns.
 *   LEFT = clinical card, no blur.
 *   RIGHT = header row [◀/▶ toggle | «История визитов» count] [«+ Новый визит»],
 *           then history feed (when visible) or hint (when hidden).
 *
 * ADD + history HIDDEN:
 *   grid lg:grid-cols-[1fr_1.3fr] — form column wider.
 *   LEFT = clinical card shown CLEARLY (no blur).
 *   RIGHT = NewVisitPanel (wide, comfortable).
 *   Toggle ▶ near history heading area to bring history back.
 *
 * ADD + history VISIBLE:
 *   grid lg:grid-cols-[0.75fr_1.25fr] — right region dominant.
 *   LEFT = clinical card BLURRED (opacity-50 blur-[1.5px]).
 *   RIGHT stacks vertically:
 *     - NewVisitPanel (full right-region width) ON TOP
 *     - «История визитов» heading (with ◀ toggle on its LEFT) + feed BELOW.
 *
 * Toggle (◀/▶) always sits LEFT of the «История визитов» heading.
 * «+ Новый визит» button always on the RIGHT of the header row.
 *
 * Data:
 *   - Clinical state (жалобы/диагнозы/визиты): GET .../clinical (real).
 *   - Анамнез: GET/POST/PATCH .../anamnesis.
 *   - Сопутствующие заболевания входят в редактор анамнеза.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { PatientCardHeader, PatientAppointmentItem } from '@/modules/doctor-clients/ports';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import type {
  ActiveComplaint,
  ActiveDiagnosis,
  AnamnesisState,
  ClinicalState,
  Visit,
} from '@/modules/patient-clinical/ports';
import { cn } from '@/lib/utils';
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
  doctorSectionSubtitleClass,
} from '@/shared/ui/doctor/doctorVisual';
import { NewVisitPanel } from './karta/NewVisitPanel';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/doctor/primitives/dialog';
import { Badge } from '@/shared/ui/doctor/primitives/badge';
import { VisitCatalogTextarea } from './karta/VisitCatalogTextarea';
import { formatPatientPackageShortLabel } from '@/modules/memberships/display';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { formatDoctorFioShort } from '@/shared/lib/fio';
import {
  PatientClinicalSections,
  type PatientClinicalComorbidity,
} from './karta/PatientClinicalSections';

type Props = {
  userId: string;
  header?: PatientCardHeader;
  /** When set, auto-open the new-visit panel (linked to this appointment). */
  pendingAppointmentId?: string | null;
  /** When set, pre-fill the new-visit date (ISO YYYY-MM-DD) from the appointment. */
  pendingVisitDate?: string | null;
  /** Location (branch name) from the source appointment — forwarded to NewVisitPanel. */
  pendingPrefillLocation?: string | null;
  /** Service name from the source appointment — forwarded to NewVisitPanel. */
  pendingPrefillService?: string | null;
  /** Opens the standard new-visit flow whenever the request id changes. */
  newVisitRequestId?: number;
  /**
   * @deprecated Duration is no longer stored on the visit (task #208). Field kept for
   * backwards-compat with PatientCardClient which still passes it. Ignored internally.
   */
  pendingPrefillDurationMin?: number | null;
  onPendingConsumed?: () => void;
  initialClinicalState?: ClinicalState | null;
  initialVisits?: Visit[] | null;
  /** SSR-provided anamnesis — skips the initial client fetch when present. */
  initialAnamnesis?: AnamnesisState | null;
  /** SSR-provided active comorbidities — skips the Comorbidities component's initial fetch. */
  initialComorbidities?: PatientClinicalComorbidity[] | null;
  /** UI-5b master/detail composition slots. Omitted for legacy standalone use. */
  composition?: {
    leftContent: ReactNode;
    rightContent: ReactNode;
    selectedAppointmentId: string | null;
    onCloseSelectedVisit: () => void;
    mobilePane: 'master' | 'detail';
    onMobilePaneChange: (pane: 'master' | 'detail') => void;
  };
};

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Visit cards
// ---------------------------------------------------------------------------
const VISIT_SECTION_FIELDS = [
  { key: 'anamnesisText', title: 'Анамнез / история жалобы' },
  { key: 'exam', title: 'Осмотр' },
  { key: 'manipulations', title: 'Проведённые манипуляции' },
  { key: 'trialResults', title: 'Результаты проб' },
  { key: 'recommendations', title: 'Рекомендации / Назначения' },
] as const;

type VisitSectionFieldKey = (typeof VISIT_SECTION_FIELDS)[number]['key'];

function VisitCard({
  visit,
  defaultExpanded,
  userId,
  onSaved,
}: {
  visit: Visit;
  defaultExpanded?: boolean;
  userId: string;
  onSaved: () => void;
}) {
  const [expanded, setExpanded] = useState(Boolean(defaultExpanded));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  // Initialize edit fields from the projection (sections by title + header location/duration).
  const initialFields = useCallback((): Record<VisitSectionFieldKey, string> => {
    const byTitle = new Map((visit.sections ?? []).map((s) => [s.title, s.body]));
    return {
      exam: byTitle.get('Осмотр') ?? '',
      anamnesisText: byTitle.get('Анамнез / история жалобы') ?? '',
      manipulations: byTitle.get('Проведённые манипуляции') ?? '',
      trialResults: byTitle.get('Результаты проб') ?? '',
      recommendations: byTitle.get('Рекомендации / Назначения') ?? '',
    };
  }, [visit.sections]);

  const [fields, setFields] = useState<Record<VisitSectionFieldKey, string>>(initialFields);
  const [location, setLocation] = useState(visit.location ?? '');
  const [duration, setDuration] = useState(visit.duration ?? '');
  const durationLabel = visit.duration
    ? /\D/.test(visit.duration)
      ? visit.duration
      : `${visit.duration} мин`
    : '';

  const openEdit = () => {
    setFields(initialFields());
    setLocation(visit.location ?? '');
    setDuration(visit.duration ?? '');
    setError(false);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setError(false);
    try {
      const res = await fetch(`/api/doctor/patients/${userId}/visits/${visit.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, location, duration }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setEditing(false);
      onSaved();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left"
      >
        <b className="text-sm text-foreground">{visit.date}</b>
        <span className="text-xs font-medium text-muted-foreground">{visit.time}</span>
        <span
          className={cn(
            'rounded-md px-1.5 py-px text-xs font-medium',
            visit.type === 'first'
              ? 'bg-primary/15 text-primary'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {visit.type === 'first' ? 'Первичный' : 'Повторный'}
        </span>
        {visit.package ? (
          <Badge
            variant="secondary"
            className="border border-violet-500/30 bg-violet-500/15 text-violet-900"
            title={visit.package.title}
          >
            {formatPatientPackageShortLabel(visit.package.displayNumber)}
          </Badge>
        ) : null}
        <span className={doctorSectionSubtitleClass}>
          {visit.location}
          {durationLabel ? ` · ${durationLabel}` : ''}
          {visit.filesCount ? ` · 📎 ${visit.filesCount}` : ''}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {expanded ? 'свернуть ▴' : 'развернуть ▾'}
        </span>
      </Button>
      {expanded ? (
        <div className="flex flex-col gap-2.5 border-t border-border px-3 py-2.5">
          {visit.dynamics && visit.dynamics.length > 0 ? (
            <div className="flex flex-col gap-1">
              <div className="text-xs font-semibold text-foreground">Динамика симптомов</div>
              <div className="flex flex-col gap-1.5">
                {visit.dynamics.map((dyn) => (
                  <div
                    key={dyn.id}
                    className="rounded-md border border-border/70 bg-muted/15 px-2.5 py-1.5"
                  >
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {dyn.priority ? <span className="font-bold text-destructive">!</span> : null}
                      {dyn.label}
                      <span className="ml-auto font-bold text-primary">
                        {dyn.from}/10 → {dyn.to}/10
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm text-foreground">{dyn.note}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {editing ? (
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-foreground">Локация</span>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Например: Кабинет 3"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-foreground">Длительность, минут</span>
                <Input
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="Например: 60"
                />
              </label>
              {VISIT_SECTION_FIELDS.map((f) => {
                if (f.key === 'manipulations' || f.key === 'recommendations') {
                  return (
                    <VisitCatalogTextarea
                      key={f.key}
                      label={f.title}
                      value={fields[f.key]}
                      onChange={(value) => setFields((prev) => ({ ...prev, [f.key]: value }))}
                      rows={2}
                      catalog={f.key}
                    />
                  );
                }
                return (
                  <label key={f.key} className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold text-foreground">{f.title}</span>
                    <Textarea
                      value={fields[f.key]}
                      onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      rows={2}
                      className="resize-y"
                    />
                  </label>
                );
              })}
              {error && <span className="text-xs text-destructive">Не удалось сохранить.</span>}
              <div className="flex items-center gap-1.5">
                <Button type="button" onClick={save} disabled={saving} size="xs">
                  {saving ? 'Сохранение…' : 'Сохранить'}
                </Button>
                <Button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  variant="outline"
                  size="xs"
                >
                  Отмена
                </Button>
              </div>
            </div>
          ) : (
            <>
              {visit.sections?.map((s) => (
                <div key={s.title} className="flex flex-col gap-0.5">
                  <div className="text-xs font-semibold text-foreground">{s.title}</div>
                  <div className="whitespace-pre-wrap break-words text-sm text-foreground">
                    {s.body}
                  </div>
                </div>
              ))}
              {visit.files && visit.files.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {visit.files.map((f) => (
                    <span
                      key={f.id}
                      className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                    >
                      <span>{f.icon}</span>
                      <span>{f.name}</span>
                    </span>
                  ))}
                  <span className={doctorSectionSubtitleClass}>
                    — файлы, прикреплённые к визиту
                  </span>
                </div>
              ) : null}
              <Button
                type="button"
                onClick={openEdit}
                variant="ghost"
                size="xs"
                className="self-start text-xs text-muted-foreground hover:text-primary"
              >
                ✎ править записи визита
              </Button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CreateVisitModeModal — выбор режима создания визита
// ---------------------------------------------------------------------------

/**
 * Модалка выбора режима создания визита:
 *   «Из записи» — выбор из списка записей пациента без привязанного визита
 *   «Без записи» — новый визит (пациент пришёл без предварительной записи)
 */
function CreateVisitModeModal({
  userId,
  open,
  onClose,
  onSelectMode,
}: {
  userId: string;
  open: boolean;
  onClose: () => void;
  /** onSelectMode(mode, appointment?) where appointment is the selected booking if mode='from_booking'. */
  onSelectMode: (mode: 'from_booking' | 'walk_in', appointment?: PatientAppointmentItem) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [appointments, setAppointments] = useState<PatientAppointmentItem[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Fetch unlinked appointments when modal opens
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- легитимный сброс состояния + fetch при открытии модалки
    setLoading(true);
    setAppointments(null);
    setSelected(null);
    fetch(`/api/doctor/patients/${userId}/appointments/unlinked`)
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{ ok: boolean; appointments: PatientAppointmentItem[] }>)
          : null,
      )
      .then((data) => {
        const appts = data?.appointments ?? [];
        setAppointments(appts);
        // Pre-select the most recent unlinked appointment (first in list)
        if (appts.length > 0 && appts[0]) {
          setSelected(appts[0].id);
        }
      })
      .catch(() => setAppointments([]))
      .finally(() => setLoading(false));
  }, [open, userId]);

  const selectedAppt = appointments?.find((a) => a.id === selected);

  const formatDateTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent showCloseButton={false} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Создать визит</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 pt-1">
          {/* Option 1: From booking */}
          <div
            className={cn(
              'flex flex-col gap-2 rounded-lg border p-3 cursor-pointer',
              'border-primary/30 bg-primary/5 hover:bg-primary/10',
            )}
          >
            <p className="text-sm font-semibold text-foreground">Из записи на приём</p>
            <p className="text-xs text-muted-foreground">
              Выберите запись пациента — дата, время, филиал и услуга подтянутся автоматически
            </p>
            {loading && <DoctorPanelLoading className="py-3" />}
            {!loading && appointments !== null && appointments.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                Нет записей без привязанного визита
              </p>
            )}
            {!loading && appointments !== null && appointments.length > 0 && (
              <div className="flex flex-col gap-1.5 max-h-[200px] overflow-y-auto">
                {appointments.map((a) => (
                  <Button
                    key={a.id}
                    type="button"
                    onClick={() => setSelected(a.id)}
                    variant="ghost"
                    className={cn(
                      'flex flex-col gap-0.5 rounded-md border px-2.5 py-2 text-left text-xs h-auto',
                      selected === a.id
                        ? 'border-primary bg-primary/10 font-medium'
                        : 'border-border hover:border-primary/40 hover:bg-muted/30',
                    )}
                  >
                    <span className="font-medium text-foreground">
                      {formatDateTime(a.dateTime)}
                    </span>
                    <span className="text-muted-foreground">
                      {[a.location, a.serviceName].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </Button>
                ))}
              </div>
            )}
            {!loading && appointments !== null && appointments.length > 0 && (
              <Button
                type="button"
                disabled={!selectedAppt}
                onClick={() => selectedAppt && onSelectMode('from_booking', selectedAppt)}
                size="sm"
                className="self-start text-xs"
              >
                Создать из выбранной записи
              </Button>
            )}
          </div>

          {/* Option 2: Walk-in (no booking) */}
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <p className="text-sm font-semibold text-foreground">Новый визит без записи</p>
            <p className="text-xs text-muted-foreground">
              Пациент пришёл без предварительной записи — дата=сегодня, время=сейчас, филиал из
              последней записи (если была)
            </p>
            <Button
              type="button"
              onClick={() => onSelectMode('walk_in')}
              variant="outline"
              size="sm"
              className="self-start text-xs"
            >
              Создать без записи
            </Button>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button type="button" onClick={onClose} variant="outline" size="sm" className="text-xs">
            Отмена
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Toggle button for history expand/collapse — always sits LEFT of the heading */
function HistoryToggleBtn({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      onClick={onToggle}
      title={visible ? 'Скрыть историю — увидеть карту' : 'Показать историю визитов'}
      variant="outline"
      size="xs"
      className="text-xs text-muted-foreground"
    >
      {visible ? '◀' : '▶'}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

interface ClinicalApiResponse {
  ok: boolean;
  state: ClinicalState;
  visits: Visit[];
}

interface AnamnesisApiResponse {
  ok: boolean;
  anamnesis: AnamnesisState;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const EMPTY_ANAMNESIS: AnamnesisState = { trauma: [], illness: [], lifestyle: [] };

export function PatientTabKarta({
  userId,
  header,
  pendingAppointmentId,
  pendingVisitDate,
  pendingPrefillLocation,
  pendingPrefillService,
  newVisitRequestId = 0,
  onPendingConsumed,
  initialClinicalState,
  initialVisits,
  initialAnamnesis,
  initialComorbidities,
  composition,
}: Props) {
  const hasSsrClinical = initialClinicalState != null && initialVisits != null;
  const [panelOpen, setPanelOpen] = useState(false);
  // The selected visit detail remains out of the way until the specialist explicitly opens it.
  const [historyVisible, setHistoryVisible] = useState(false);

  // Create-visit mode picker: null = closed; opens when user clicks «+ Новый визит»
  // (but NOT when auto-opened via pendingAppointmentId, which bypasses the picker).
  const [modePickerOpen, setModePickerOpen] = useState(false);
  // The appointment this visit is being created from (null = walk-in without booking).
  const [sourceAppointment, setSourceAppointment] = useState<PatientAppointmentItem | null>(null);

  // Clinical data — loaded from /api/doctor/patients/[userId]/clinical
  const [complaints, setComplaints] = useState<ActiveComplaint[]>(() =>
    hasSsrClinical ? initialClinicalState!.complaints : [],
  );
  const [diagnoses, setDiagnoses] = useState<ActiveDiagnosis[]>(() =>
    hasSsrClinical ? initialClinicalState!.diagnoses : [],
  );
  const [complaintHistory, setComplaintHistory] = useState<ActiveComplaint[]>(() =>
    hasSsrClinical ? initialClinicalState!.complaintHistory : [],
  );
  const [diagnosisHistory, setDiagnosisHistory] = useState<ActiveDiagnosis[]>(() =>
    hasSsrClinical ? initialClinicalState!.diagnosisHistory : [],
  );
  const [visits, setVisits] = useState<Visit[]>(() => (hasSsrClinical ? initialVisits! : []));
  const [isLoading, setIsLoading] = useState(!hasSsrClinical);
  const [fetchError, setFetchError] = useState(false);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(() =>
    hasSsrClinical ? userId : null,
  );

  // Anamnesis data — loaded from /api/doctor/patients/[userId]/anamnesis
  const hasSsrAnamnesis = initialAnamnesis != null;
  const [anamnesis, setAnamnesis] = useState<AnamnesisState>(
    () => initialAnamnesis ?? EMPTY_ANAMNESIS,
  );
  const [anamnesisLoadedUserId, setAnamnesisLoadedUserId] = useState<string | null>(() =>
    hasSsrAnamnesis ? userId : null,
  );
  const [anamnesisError, setAnamnesisError] = useState(false);
  // fetchClinical is stable per userId — used on mount + after save
  const fetchClinical = useCallback(() => {
    fetch(`/api/doctor/patients/${userId}/clinical`)
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json() as Promise<ClinicalApiResponse>;
      })
      .then((data) => {
        setComplaints(data.state.complaints);
        setDiagnoses(data.state.diagnoses);
        setComplaintHistory(data.state.complaintHistory);
        setDiagnosisHistory(data.state.diagnosisHistory);
        setVisits(data.visits);
        setFetchError(false);
        setLoadedUserId(userId);
        setIsLoading(false);
      })
      .catch(() => {
        setFetchError(true);
        setLoadedUserId(userId);
        setIsLoading(false);
      });
  }, [userId]);

  const fetchAnamnesis = useCallback(() => {
    fetch(`/api/doctor/patients/${userId}/anamnesis`)
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json() as Promise<AnamnesisApiResponse>;
      })
      .then((data) => {
        setAnamnesis(data.anamnesis ?? EMPTY_ANAMNESIS);
        setAnamnesisError(false);
        setAnamnesisLoadedUserId(userId);
      })
      .catch(() => {
        setAnamnesisError(true);
        setAnamnesisLoadedUserId(userId);
      });
  }, [userId]);

  useEffect(() => {
    // Skip clinical fetch on mount when SSR data covers this userId.
    // fetchClinical() remains callable after mutations (onSaved callbacks).
    if (hasSsrClinical && loadedUserId === userId) {
      // Skip anamnesis fetch too when SSR data provided.
      if (!hasSsrAnamnesis) fetchAnamnesis();
      return;
    }
    fetchClinical();
    if (!hasSsrAnamnesis) fetchAnamnesis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchClinical, fetchAnamnesis]);

  // Auto-open new visit panel when navigated via URL param or in-page tab switch from Визиты.
  // onPendingConsumed is NOT called here — NewVisitPanel calls it after capturing the pending
  // props via useState() initializers, preventing a race where parent resets prefill* before
  // the panel even mounts.
  useEffect(() => {
    if (pendingAppointmentId) {
      setPanelOpen(true);
    }
  }, [pendingAppointmentId]);

  useEffect(() => {
    const handleNewVisit = () => setModePickerOpen(true);
    window.addEventListener('patient:new-visit', handleNewVisit);
    return () => window.removeEventListener('patient:new-visit', handleNewVisit);
  }, []);

  useEffect(() => {
    if (newVisitRequestId > 0) setModePickerOpen(true);
  }, [newVisitRequestId]);

  // Treat as loading while userId doesn't match loaded data
  const isStale = loadedUserId !== userId;
  const loading = isStale || isLoading;
  // Anamnesis loading derived (mirrors clinical) — avoids synchronous setState in effect
  const anamnesisLoading = anamnesisLoadedUserId !== userId;
  const patientName = header
    ? formatDoctorFioShort(header.identity, header.identity.displayName)
    : null;

  /**
   * Grid column ratios per state matrix:
   *   DEFAULT:             1.1fr / 1fr   — balanced, card slightly wider
   *   ADD + history HIDDEN: 1fr / 1.3fr  — form column wider, card clear
   *   ADD + history VISIBLE: 0.75fr / 1.25fr — right dominant, card blurred
   */
  const gridCols = composition
    ? panelOpen || composition.selectedAppointmentId
      ? 'md:grid-cols-2'
      : 'grid-cols-1'
    : !panelOpen
      ? 'lg:grid-cols-[1.1fr_1fr]'
      : historyVisible
        ? 'lg:grid-cols-[0.75fr_1.25fr]'
        : 'lg:grid-cols-[1fr_1.3fr]';

  /**
   * Blur the LEFT clinical card ONLY when panel is open, history is visible, AND there are
   * actual visits — don't blur when opening a new form on an empty history (VIZ-05).
   */
  const leftBlur = panelOpen && historyVisible && visits.length > 0;
  const selectedVisit = composition?.selectedAppointmentId
    ? (visits.find((visit) => visit.canonicalAppointmentId === composition.selectedAppointmentId) ??
      null)
    : null;

  // Callback for NewVisitPanel after successful save — refetch + close panel + show history
  const handleVisitSaved = useCallback(() => {
    setPanelOpen(false);
    setHistoryVisible(true);
    setSourceAppointment(null);
    fetchClinical();
  }, [fetchClinical]);

  return (
    <>
      <div className={cn('grid items-start gap-2.5', gridCols)}>
        {/* ── LEFT: clinical state (Карта) ─────────────────────────────────── */}
        <div
          className={cn(
            'flex flex-col gap-2.5 transition-all duration-200',
            leftBlur && 'opacity-50 blur-[1.5px]',
            composition?.mobilePane === 'detail' &&
              (panelOpen || composition.selectedAppointmentId) &&
              'hidden md:flex',
          )}
        >
          {composition?.leftContent}
          <PatientClinicalSections
            userId={userId}
            patientName={patientName}
            patientOnSupport={header?.support.isOnSupport ?? false}
            complaints={complaints}
            complaintHistory={complaintHistory}
            diagnoses={diagnoses}
            diagnosisHistory={diagnosisHistory}
            loading={loading}
            fetchError={fetchError}
            onClinicalRefresh={fetchClinical}
            anamnesis={anamnesis}
            anamnesisLoading={anamnesisLoading}
            anamnesisError={anamnesisError}
            onAnamnesisRefresh={fetchAnamnesis}
            initialComorbidities={initialComorbidities ?? undefined}
          />
        </div>

        {/* ── RIGHT: visits feed / new-visit panel ─────────────────────────── */}
        <div
          className={cn(
            'flex flex-col gap-2.5',
            composition && !panelOpen && !composition.selectedAppointmentId
              ? 'hidden'
              : composition?.mobilePane === 'master' && 'hidden md:flex',
          )}
        >
          {composition ? (
            panelOpen ? (
              <NewVisitPanel
                userId={userId}
                activeComplaints={complaints}
                activeDiagnoses={diagnoses}
                pendingVisitDate={pendingVisitDate}
                pendingLocation={pendingPrefillLocation ?? sourceAppointment?.location ?? null}
                pendingService={pendingPrefillService ?? sourceAppointment?.serviceName ?? null}
                sourceAppointment={sourceAppointment}
                onPendingConsumed={onPendingConsumed}
                onClose={() => {
                  setPanelOpen(false);
                  setSourceAppointment(null);
                }}
                onSaved={handleVisitSaved}
              />
            ) : selectedVisit ? (
              <section className={doctorSectionCardClass}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className={doctorSectionTitleClass}>Заметки визита</h2>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={composition.onCloseSelectedVisit}
                  >
                    Закрыть
                  </Button>
                </div>
                <VisitCard
                  visit={selectedVisit}
                  defaultExpanded
                  userId={userId}
                  onSaved={fetchClinical}
                />
              </section>
            ) : (
              composition.rightContent
            )
          ) : (
            <>
              {/* ── History header row — ALWAYS at the top of the right column.
             This ensures the toggle arrow (◀/▶) never jumps when panelOpen
             or visitType changes. The «+ Новый визит» button is hidden while
             the form is open to avoid double-open. ────────────────────────── */}
              <div className="flex items-center gap-2">
                {!loading && visits.length > 0 ? (
                  <HistoryToggleBtn
                    visible={historyVisible}
                    onToggle={() => setHistoryVisible((v) => !v)}
                  />
                ) : null}
                <h2 className={doctorSectionTitleClass}>История визитов</h2>
                {!loading && (
                  <span className={doctorSectionSubtitleClass}>{visits.length} визитов</span>
                )}
                {!panelOpen && (
                  <Button
                    type="button"
                    onClick={() => setModePickerOpen(true)}
                    size="xs"
                    className="ml-auto"
                  >
                    + Новый визит
                  </Button>
                )}
              </div>

              {/* ── New visit form (shown when panelOpen) ────────────────────────── */}
              {panelOpen && (
                <div
                  className={cn('relative z-10', historyVisible ? 'max-h-[78vh]' : 'max-h-[85vh]')}
                >
                  <NewVisitPanel
                    userId={userId}
                    activeComplaints={complaints}
                    activeDiagnoses={diagnoses}
                    pendingVisitDate={pendingVisitDate}
                    pendingLocation={pendingPrefillLocation ?? sourceAppointment?.location ?? null}
                    pendingService={pendingPrefillService ?? sourceAppointment?.serviceName ?? null}
                    sourceAppointment={sourceAppointment}
                    onPendingConsumed={onPendingConsumed}
                    onClose={() => {
                      setPanelOpen(false);
                      setSourceAppointment(null);
                    }}
                    onSaved={handleVisitSaved}
                  />
                </div>
              )}

              {/* ── History feed (shown when historyVisible) ─────────────────────── */}
              {historyVisible ? (
                <div
                  className={cn(
                    'flex flex-col gap-2.5',
                    panelOpen && 'max-h-[60vh] overflow-y-auto opacity-80',
                  )}
                >
                  {loading && <DoctorPanelLoading className="py-3" />}
                  {!loading && fetchError && (
                    <p className="py-1 text-xs text-destructive">
                      Не удалось загрузить историю визитов.
                    </p>
                  )}
                  {!loading && !fetchError && visits.length === 0 && (
                    <p className="py-2 text-xs text-muted-foreground">Визитов пока нет.</p>
                  )}
                  {!loading &&
                    visits.map((v, i) => (
                      <VisitCard
                        key={v.id}
                        visit={v}
                        defaultExpanded={i === 0}
                        userId={userId}
                        onSaved={fetchClinical}
                      />
                    ))}
                  {!panelOpen && (
                    <p className={doctorSectionSubtitleClass}>
                      История визитов — справа. «+ Новый визит» переключает экран в режим
                      добавления. Стрелка ◀ скрывает историю — карта снова видна чётко рядом с
                      формой.
                    </p>
                  )}
                </div>
              ) : (
                !panelOpen && (
                  <p className={doctorSectionSubtitleClass}>
                    История скрыта — карта видна слева без блюра. Нажмите ▶, чтобы вернуть историю
                    визитов.
                  </p>
                )
              )}
            </>
          )}
        </div>
      </div>

      {/* Mode picker modal — opens when doctor clicks «+ Новый визит» */}
      <CreateVisitModeModal
        userId={userId}
        open={modePickerOpen}
        onClose={() => setModePickerOpen(false)}
        onSelectMode={(mode, appointment) => {
          setModePickerOpen(false);
          if (mode === 'from_booking' && appointment) {
            setSourceAppointment(appointment);
          } else {
            setSourceAppointment(null);
          }
          setPanelOpen(true);
          composition?.onMobilePaneChange('detail');
        }}
      />
    </>
  );
}
