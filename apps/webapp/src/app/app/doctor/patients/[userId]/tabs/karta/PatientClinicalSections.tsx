'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, FilePlus2, HeartPlus, Plus, SquarePen } from 'lucide-react';
import toast from 'react-hot-toast';
import type {
  ActiveComplaint,
  ActiveDiagnosis,
  AnamnesisState,
  DiagnosisClinicalStatus,
} from '@/modules/patient-clinical/ports';
import { cn } from '@/lib/utils';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import { Checkbox } from '@/shared/ui/doctor/primitives/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/shared/ui/doctor/primitives/select';
import { DoctorModal, DoctorModalStackedTitle } from '@/shared/ui/doctor/DoctorModal';
import { useIsMobileViewport } from '@/shared/ui/doctor/primitives/useIsMobileViewport';
import {
  DoctorDnaFlatList,
  doctorDnaFlatListClickableClass,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { doctorSectionCardClass, doctorSectionTitleClass } from '@/shared/ui/doctor/doctorVisual';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';

export type PatientClinicalComorbidity = {
  id: string;
  text: string;
  since: string | null;
  status: 'active' | 'removed';
  createdAt: string;
};

type Props = {
  userId: string;
  patientName: string | null;
  patientOnSupport: boolean;
  complaints: ActiveComplaint[];
  complaintHistory: ActiveComplaint[];
  diagnoses: ActiveDiagnosis[];
  diagnosisHistory: ActiveDiagnosis[];
  loading: boolean;
  fetchError: boolean;
  onClinicalRefresh: () => void;
  anamnesis: AnamnesisState;
  anamnesisLoading: boolean;
  anamnesisError: boolean;
  onAnamnesisRefresh: () => void;
  /** Typed composition slot: encounter summary belongs after disease, before life anamnesis. */
  betweenDiseaseAndLife?: ReactNode;
  initialComorbidities?: PatientClinicalComorbidity[];
};

type ComplaintDraft = {
  text: string;
  description: string;
  priority: boolean;
  severity: string;
};

type DiagnosisDraft = {
  text: string;
  comment: string;
  priority: boolean;
};

const EMPTY_COMPLAINT: ComplaintDraft = {
  text: '',
  description: '',
  priority: false,
  severity: '0',
};

const EMPTY_DIAGNOSIS: DiagnosisDraft = { text: '', comment: '', priority: false };

function patientTitle(
  label: string,
  patientName: string | null,
  patientOnSupport: boolean,
  entity?: ReactNode,
) {
  return (
    <DoctorModalStackedTitle
      label={label}
      entity={entity}
      patientName={patientName}
      patientOnSupport={patientOnSupport}
      patientVariant="context"
      entityClassName={entity ? 'text-primary' : undefined}
    />
  );
}

function SectionHeader({
  title,
  history,
  onHistoryChange,
  onAdd,
  addLabel,
  addIcon,
}: {
  title: string;
  history: boolean;
  onHistoryChange: () => void;
  onAdd: () => void;
  addLabel: string;
  addIcon: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-[var(--doctor-block-padding,18px)] pb-2 pt-[var(--doctor-block-padding,18px)]">
      <h3 className={doctorSectionTitleClass}>{title}</h3>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={history}
          className={cn(
            'h-8 px-2.5 text-sm font-normal',
            history && 'border-primary bg-primary/5 text-primary hover:bg-primary/10',
          )}
          onClick={onHistoryChange}
        >
          История
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" title={addLabel} onClick={onAdd}>
          {addIcon}
        </Button>
      </div>
    </div>
  );
}

function severityTextClass(value: number) {
  if (value >= 7) return 'text-destructive';
  if (value >= 4) return 'text-doctor-calendar-today';
  return 'text-primary';
}

function severityBadgeClass(value: number) {
  if (value >= 7) return 'bg-destructive/10 text-destructive';
  if (value >= 4) return 'bg-doctor-calendar-today/10 text-doctor-calendar-today';
  return 'bg-primary/10 text-primary';
}

function daysSince(iso: string): number {
  const start = new Date(iso).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((Date.now() - start) / 86_400_000));
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Первая строка непустого текста; '' если текста нет или он пуст после трима. */
function firstLine(text: string | null | undefined): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (!trimmed) return '';
  return trimmed.split('\n')[0]?.trim() ?? '';
}

/**
 * CLINICAL-SYMPTOM-01: превью анамнеза под названием симптома — первая строка исходного
 * `description`, иначе первая строка самой ранней непустой записи history. '' — нет превью
 * (CLINICAL-SYMPTOM-02: пустой preview не выводится).
 */
function complaintAnamnesisPreview(complaint: ActiveComplaint): string {
  const fromDescription = firstLine(complaint.description);
  if (fromDescription) return fromDescription;
  for (const entry of complaint.history) {
    const line = firstLine(entry.note);
    if (line) return line;
  }
  return '';
}

function ComplaintTrend({
  complaint,
  expanded = false,
}: {
  complaint: ActiveComplaint;
  expanded?: boolean;
}) {
  const points = complaint.trend.length > 0 ? complaint.trend : [complaint.currentSeverity];
  const first = points[0] ?? complaint.currentSeverity;
  const last = points[points.length - 1] ?? complaint.currentSeverity;
  const trendClass =
    last > first ? 'text-destructive' : last < first ? 'text-emerald-600' : 'text-primary';
  const width = expanded ? 220 : 58;
  const height = expanded ? 54 : 22;
  const step = points.length > 1 ? (width - 8) / (points.length - 1) : 0;
  const coords = points.map((point, index) => ({
    x: 4 + index * step,
    y: 4 + (1 - point / 10) * (height - 8),
  }));
  const polyline = coords.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <span className={cn('flex items-center gap-1.5', trendClass)}>
      <span
        className={cn('rounded px-1.5 py-0.5 text-xs font-semibold', severityBadgeClass(first))}
      >
        {first}
      </span>
      <svg width={width} height={height} aria-hidden="true" className="shrink-0 overflow-visible">
        {coords.length > 1 ? (
          <polyline
            points={polyline}
            fill="none"
            stroke="currentColor"
            strokeWidth={expanded ? 2 : 1.5}
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          <line x1="4" y1={height / 2} x2={width - 4} y2={height / 2} stroke="currentColor" />
        )}
      </svg>
      <span className={cn('whitespace-nowrap text-sm font-semibold', severityTextClass(last))}>
        {last}/10
      </span>
    </span>
  );
}

function ComplaintRow({
  complaint,
  historical,
  onOpen,
}: {
  complaint: ActiveComplaint;
  historical: boolean;
  onOpen: () => void;
}) {
  const anamnesisPreview = complaintAnamnesisPreview(complaint);
  return (
    <li>
      <button
        type="button"
        className={cn(
          doctorDnaFlatListRowClass,
          doctorDnaFlatListClickableClass,
          'w-full items-stretch text-left',
          historical && 'text-muted-foreground',
        )}
        onClick={onOpen}
      >
        <span className="relative min-w-0 flex-1">
          {complaint.priority && !historical ? (
            <span
              className="absolute -left-3 top-1/2 -translate-y-1/2 text-base font-bold text-destructive"
              title="Ключевой симптом"
            >
              !
            </span>
          ) : null}
          <span
            className={cn(doctorDnaFlatListPrimaryClass, historical && 'text-muted-foreground')}
          >
            {complaint.text}
          </span>
          {anamnesisPreview ? (
            <span className={cn(doctorDnaFlatListMetaClass, 'mt-0.5 block truncate font-normal')}>
              {anamnesisPreview}
            </span>
          ) : null}
          <span
            className={cn(
              doctorDnaFlatListMetaClass,
              'mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1',
            )}
          >
            <span>
              {historical
                ? `${formatDate(complaint.createdAt)} — ${formatDate(complaint.resolvedAt ?? complaint.createdAt)}`
                : `${complaint.since} (${daysSince(complaint.createdAt)} дн.)`}
            </span>
            <ComplaintTrend complaint={complaint} />
          </span>
        </span>
      </button>
    </li>
  );
}

function DiagnosisRow({
  diagnosis,
  historical,
  onOpen,
}: {
  diagnosis: ActiveDiagnosis;
  historical: boolean;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={cn(
          doctorDnaFlatListRowClass,
          doctorDnaFlatListClickableClass,
          'w-full items-stretch text-left',
          historical && 'text-muted-foreground',
        )}
        onClick={onOpen}
      >
        <span className="relative min-w-0 flex-1">
          {diagnosis.priority && !historical ? (
            <span className="absolute -left-3 top-1/2 -translate-y-1/2 text-base font-bold text-destructive">
              !
            </span>
          ) : null}
          <span
            className={cn(doctorDnaFlatListPrimaryClass, historical && 'text-muted-foreground')}
          >
            {diagnosis.text}
          </span>
          <span
            className={cn(
              doctorDnaFlatListMetaClass,
              'mt-1 flex items-center justify-between gap-3',
            )}
          >
            <span>{diagnosis.meta}</span>
            {!historical ? <span>{diagnosis.clinicalStatus}</span> : null}
          </span>
        </span>
      </button>
    </li>
  );
}

function RequiredLabel({ children }: { children: ReactNode }) {
  return <label className="text-sm font-medium text-foreground">{children}</label>;
}

function FormError({ visible }: { visible: boolean }) {
  return visible ? <p className="text-sm text-destructive">Не удалось сохранить.</p> : null;
}

function PriorityControl({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      Ключевой
      {checked ? <span className="font-bold text-destructive">!</span> : null}
    </label>
  );
}

export function PatientClinicalSections({
  userId,
  patientName,
  patientOnSupport,
  complaints,
  complaintHistory,
  diagnoses,
  diagnosisHistory,
  loading,
  fetchError,
  onClinicalRefresh,
  anamnesis,
  anamnesisLoading,
  anamnesisError,
  onAnamnesisRefresh,
  betweenDiseaseAndLife,
  initialComorbidities,
}: Props) {
  const [showComplaintHistory, setShowComplaintHistory] = useState(false);
  const [showDiagnosisHistory, setShowDiagnosisHistory] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<ActiveComplaint | null>(null);
  const [selectedDiagnosis, setSelectedDiagnosis] = useState<ActiveDiagnosis | null>(null);
  const [complaintAddOpen, setComplaintAddOpen] = useState(false);
  const [complaintEditOpen, setComplaintEditOpen] = useState(false);
  const [diagnosisAddOpen, setDiagnosisAddOpen] = useState(false);
  const [diagnosisEditOpen, setDiagnosisEditOpen] = useState(false);
  const [complaintDraft, setComplaintDraft] = useState<ComplaintDraft>(EMPTY_COMPLAINT);
  const [diagnosisDraft, setDiagnosisDraft] = useState<DiagnosisDraft>(EMPTY_DIAGNOSIS);
  const [updateSeverity, setUpdateSeverity] = useState('0');
  const [updateNote, setUpdateNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const complaintList = showComplaintHistory ? complaintHistory : complaints;
  const diagnosisList = showDiagnosisHistory ? diagnosisHistory : diagnoses;

  useEffect(() => {
    if (!selectedComplaint) return;
    const current = [...complaints, ...complaintHistory].find(
      (item) => item.id === selectedComplaint.id,
    );
    if (current) setSelectedComplaint(current);
  }, [complaints, complaintHistory, selectedComplaint]);

  useEffect(() => {
    if (!selectedDiagnosis) return;
    const current = [...diagnoses, ...diagnosisHistory].find(
      (item) => item.id === selectedDiagnosis.id,
    );
    if (current) setSelectedDiagnosis(current);
  }, [diagnoses, diagnosisHistory, selectedDiagnosis]);

  const request = async (url: string, method: 'POST' | 'PATCH', body: object) => {
    setSaving(true);
    setSaveError(false);
    try {
      const response = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      return true;
    } catch {
      setSaveError(true);
      toast.error('Не удалось сохранить');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveComplaint = async () => {
    if (!selectedComplaint || !complaintDraft.text.trim()) {
      setSaveError(true);
      return;
    }
    const ok = await request(
      `/api/doctor/patients/${userId}/complaints/${selectedComplaint.id}`,
      'PATCH',
      {
        text: complaintDraft.text.trim(),
        description: complaintDraft.description.trim() || null,
        priority: complaintDraft.priority,
      },
    );
    if (!ok) return;
    setComplaintEditOpen(false);
    toast.success('Изменения сохранены');
    onClinicalRefresh();
  };

  const appendComplaintValue = async (resolved: boolean) => {
    if (!selectedComplaint) return;
    const severity = resolved ? 0 : Number(updateSeverity);
    if (!Number.isInteger(severity) || severity < 0 || severity > 10) {
      setSaveError(true);
      return;
    }
    const ok = await request(
      `/api/doctor/patients/${userId}/complaints/${selectedComplaint.id}/updates`,
      'POST',
      { severity, note: updateNote.trim() || null, resolved },
    );
    if (!ok) return;
    setUpdateNote('');
    toast.success(resolved ? 'Симптом закрыт' : 'Значение добавлено');
    onClinicalRefresh();
    if (resolved) setSelectedComplaint(null);
  };

  const saveDiagnosis = async () => {
    if (!selectedDiagnosis || !diagnosisDraft.text.trim()) {
      setSaveError(true);
      return;
    }
    const ok = await request(
      `/api/doctor/patients/${userId}/diagnoses/${selectedDiagnosis.id}`,
      'PATCH',
      {
        text: diagnosisDraft.text.trim(),
        priority: diagnosisDraft.priority,
        comment: diagnosisDraft.comment.trim() || null,
      },
    );
    if (!ok) return;
    setDiagnosisEditOpen(false);
    toast.success('Изменения сохранены');
    onClinicalRefresh();
  };

  const changeDiagnosisStatus = async (status: DiagnosisClinicalStatus) => {
    if (!selectedDiagnosis) return;
    const ok = await request(
      `/api/doctor/patients/${userId}/diagnoses/${selectedDiagnosis.id}/status`,
      'PATCH',
      { status },
    );
    if (!ok) return;
    toast.success(status === 'закрытый' ? 'Диагноз закрыт' : 'Статус изменён');
    onClinicalRefresh();
    if (status === 'закрытый') setSelectedDiagnosis(null);
  };

  const openComplaintEdit = () => {
    if (!selectedComplaint) return;
    setComplaintDraft({
      text: selectedComplaint.text,
      description: selectedComplaint.description ?? '',
      priority: selectedComplaint.priority,
      severity: String(selectedComplaint.currentSeverity),
    });
    setSaveError(false);
    setComplaintEditOpen(true);
  };

  const openDiagnosisEdit = () => {
    if (!selectedDiagnosis) return;
    setDiagnosisDraft({
      text: selectedDiagnosis.text,
      comment: selectedDiagnosis.comment ?? '',
      priority: selectedDiagnosis.priority,
    });
    setSaveError(false);
    setDiagnosisEditOpen(true);
  };

  return (
    <>
      <section className={cn(doctorSectionCardClass, 'gap-0 overflow-hidden p-0')}>
        <SectionHeader
          title="Симптомы"
          history={showComplaintHistory}
          onHistoryChange={() => setShowComplaintHistory((value) => !value)}
          onAdd={() => {
            setComplaintDraft(EMPTY_COMPLAINT);
            setSaveError(false);
            setComplaintAddOpen(true);
          }}
          addLabel="Добавить симптом"
          addIcon={<FilePlus2 className="size-5" />}
        />
        {loading ? <DoctorPanelLoading className="py-5" /> : null}
        {!loading && fetchError ? (
          <p className="px-[var(--doctor-block-padding,18px)] pb-4 text-sm text-destructive">
            Не удалось загрузить симптомы.
          </p>
        ) : null}
        {!loading && !fetchError && complaintList.length === 0 ? (
          <p className="px-[var(--doctor-block-padding,18px)] pb-4 text-sm text-muted-foreground">
            —
          </p>
        ) : null}
        {!loading && !fetchError && complaintList.length > 0 ? (
          <DoctorDnaFlatList>
            {complaintList.map((complaint) => (
              <ComplaintRow
                key={complaint.id}
                complaint={complaint}
                historical={showComplaintHistory}
                onOpen={() => {
                  setSelectedComplaint(complaint);
                  setUpdateSeverity(String(complaint.currentSeverity));
                  setUpdateNote('');
                  setSaveError(false);
                }}
              />
            ))}
          </DoctorDnaFlatList>
        ) : null}
      </section>

      <section className={cn(doctorSectionCardClass, 'gap-0 overflow-hidden p-0')}>
        <SectionHeader
          title="Диагнозы"
          history={showDiagnosisHistory}
          onHistoryChange={() => setShowDiagnosisHistory((value) => !value)}
          onAdd={() => {
            setDiagnosisDraft(EMPTY_DIAGNOSIS);
            setSaveError(false);
            setDiagnosisAddOpen(true);
          }}
          addLabel="Добавить диагноз"
          addIcon={<HeartPlus className="size-5" />}
        />
        {loading ? <DoctorPanelLoading className="py-5" /> : null}
        {!loading && fetchError ? (
          <p className="px-[var(--doctor-block-padding,18px)] pb-4 text-sm text-destructive">
            Не удалось загрузить диагнозы.
          </p>
        ) : null}
        {!loading && !fetchError && diagnosisList.length === 0 ? (
          <p className="px-[var(--doctor-block-padding,18px)] pb-4 text-sm text-muted-foreground">
            —
          </p>
        ) : null}
        {!loading && !fetchError && diagnosisList.length > 0 ? (
          <DoctorDnaFlatList>
            {diagnosisList.map((diagnosis) => (
              <DiagnosisRow
                key={diagnosis.id}
                diagnosis={diagnosis}
                historical={showDiagnosisHistory}
                onOpen={() => {
                  setSelectedDiagnosis(diagnosis);
                  setSaveError(false);
                }}
              />
            ))}
          </DoctorDnaFlatList>
        ) : null}
      </section>

      <DiseaseAnamnesisSection
        userId={userId}
        patientName={patientName}
        patientOnSupport={patientOnSupport}
        text={anamnesis.disease ?? ''}
        loading={anamnesisLoading}
        error={anamnesisError}
        onRefresh={onAnamnesisRefresh}
      />

      {betweenDiseaseAndLife}

      <LifeAnamnesisSection
        userId={userId}
        patientName={patientName}
        patientOnSupport={patientOnSupport}
        state={anamnesis}
        loading={anamnesisLoading}
        error={anamnesisError}
        onRefresh={onAnamnesisRefresh}
        initialComorbidities={initialComorbidities}
      />

      <PatientClinicalCreateModal
        kind="complaint"
        open={complaintAddOpen}
        userId={userId}
        patientName={patientName}
        patientOnSupport={patientOnSupport}
        onClose={() => setComplaintAddOpen(false)}
        onSaved={onClinicalRefresh}
      />

      <DoctorModal
        open={selectedComplaint !== null}
        onClose={() => setSelectedComplaint(null)}
        title={patientTitle('Симптом', patientName, patientOnSupport, selectedComplaint?.text)}
        size="md"
        bodyClassName="space-y-4"
        footer={
          selectedComplaint && !selectedComplaint.resolvedAt ? (
            <>
              <Button type="button" variant="outline" onClick={openComplaintEdit}>
                Изменить
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={saving}
                onClick={() => void appendComplaintValue(true)}
              >
                Закрыть
              </Button>
            </>
          ) : undefined
        }
      >
        {selectedComplaint ? (
          <>
            {selectedComplaint.description ? (
              <p className="text-base">{selectedComplaint.description}</p>
            ) : null}
            <div className="flex justify-center rounded-lg bg-muted/20 p-3">
              <ComplaintTrend complaint={selectedComplaint} expanded />
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold">История выраженности</h4>
              <DoctorDnaFlatList>
                {selectedComplaint.history.map((entry) => (
                  <li
                    key={entry.id}
                    className={cn(doctorDnaFlatListRowClass, 'items-start justify-between')}
                  >
                    <span>
                      <span className={doctorDnaFlatListPrimaryClass}>
                        {entry.note || 'Без заметки'}
                      </span>
                      <span className={cn(doctorDnaFlatListMetaClass, 'mt-0.5')}>
                        {formatDate(entry.recordedAt)}
                      </span>
                    </span>
                    <span className={cn('font-semibold', severityTextClass(entry.severity))}>
                      {entry.severity}/10
                    </span>
                  </li>
                ))}
              </DoctorDnaFlatList>
            </div>
            {!selectedComplaint.resolvedAt ? (
              <div className="space-y-2 border-t border-border pt-4">
                <h4 className="text-sm font-semibold">Новое значение</h4>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={updateSeverity}
                  onChange={(event) => setUpdateSeverity(event.target.value)}
                />
                <Textarea
                  value={updateNote}
                  onChange={(event) => setUpdateNote(event.target.value)}
                  placeholder="Заметка"
                />
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => void appendComplaintValue(false)}
                >
                  Добавить
                </Button>
                <FormError visible={saveError} />
              </div>
            ) : null}
          </>
        ) : null}
      </DoctorModal>

      <ComplaintFormModal
        open={complaintEditOpen}
        nested
        patientTitle={patientTitle('Изменить симптом', patientName, patientOnSupport)}
        draft={complaintDraft}
        onDraft={setComplaintDraft}
        saving={saving}
        error={saveError}
        onClose={() => setComplaintEditOpen(false)}
        onSave={() => void saveComplaint()}
      />

      <PatientClinicalCreateModal
        kind="diagnosis"
        open={diagnosisAddOpen}
        userId={userId}
        patientName={patientName}
        patientOnSupport={patientOnSupport}
        onClose={() => setDiagnosisAddOpen(false)}
        onSaved={onClinicalRefresh}
      />

      <DoctorModal
        open={selectedDiagnosis !== null}
        onClose={() => setSelectedDiagnosis(null)}
        title={patientTitle('Диагноз', patientName, patientOnSupport, selectedDiagnosis?.text)}
        size="md"
        bodyClassName="space-y-4"
        footer={
          selectedDiagnosis && selectedDiagnosis.clinicalStatus !== 'закрытый' ? (
            <Button type="button" variant="outline" onClick={openDiagnosisEdit}>
              Изменить
            </Button>
          ) : undefined
        }
      >
        {selectedDiagnosis ? (
          <>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{selectedDiagnosis.meta}</p>
              {selectedDiagnosis.comment ? <p>{selectedDiagnosis.comment}</p> : null}
            </div>
            {selectedDiagnosis.clinicalStatus !== 'закрытый' ? (
              <div className="space-y-2 border-t border-border pt-4">
                <RequiredLabel>Статус</RequiredLabel>
                <Select
                  value={selectedDiagnosis.clinicalStatus}
                  onValueChange={(value) =>
                    void changeDiagnosisStatus(value as DiagnosisClinicalStatus)
                  }
                >
                  <SelectTrigger className="w-full">
                    {selectedDiagnosis.clinicalStatus}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="предварительный">Предварительный</SelectItem>
                    <SelectItem value="подтверждённый">Подтверждённый</SelectItem>
                    <SelectItem value="закрытый">Закрыть диагноз</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </>
        ) : null}
      </DoctorModal>

      <DiagnosisFormModal
        open={diagnosisEditOpen}
        nested
        patientTitle={patientTitle('Изменить диагноз', patientName, patientOnSupport)}
        draft={diagnosisDraft}
        onDraft={setDiagnosisDraft}
        saving={saving}
        error={saveError}
        onClose={() => setDiagnosisEditOpen(false)}
        onSave={() => void saveDiagnosis()}
      />
    </>
  );
}

/**
 * One patient-scoped create form for the card and encounter page. It owns the accepted
 * DoctorModal chrome and the established complaints/diagnoses contracts, so a new encounter
 * never gains a second simplified clinical form.
 */
export function PatientClinicalCreateModal({
  kind,
  open,
  userId,
  patientName,
  patientOnSupport,
  onClose,
  onSaved,
}: {
  kind: 'complaint' | 'diagnosis';
  open: boolean;
  userId: string;
  patientName: string | null;
  patientOnSupport: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [complaintDraft, setComplaintDraft] = useState<ComplaintDraft>(EMPTY_COMPLAINT);
  const [diagnosisDraft, setDiagnosisDraft] = useState<DiagnosisDraft>(EMPTY_DIAGNOSIS);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setComplaintDraft(EMPTY_COMPLAINT);
    setDiagnosisDraft(EMPTY_DIAGNOSIS);
    setSaveError(false);
  }, [kind, open]);

  const save = async () => {
    const complaint = kind === 'complaint';
    const text = (complaint ? complaintDraft.text : diagnosisDraft.text).trim();
    const severity = Number(complaintDraft.severity);
    if (
      !text ||
      (complaint && (!Number.isInteger(severity) || severity < 0 || severity > 10))
    ) {
      setSaveError(true);
      return;
    }

    setSaving(true);
    setSaveError(false);
    try {
      const response = await fetch(
        `/api/doctor/patients/${userId}/${complaint ? 'complaints' : 'diagnoses'}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            complaint
              ? {
                  text,
                  description: complaintDraft.description.trim() || null,
                  priority: complaintDraft.priority,
                  severity,
                }
              : {
                  text,
                  priority: diagnosisDraft.priority,
                  comment: diagnosisDraft.comment.trim() || null,
                },
          ),
        },
      );
      if (!response.ok) throw new Error(`status ${response.status}`);
      toast.success(complaint ? 'Симптом добавлен' : 'Диагноз добавлен');
      onSaved();
      onClose();
    } catch {
      setSaveError(true);
      toast.error('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  if (kind === 'complaint') {
    return (
      <ComplaintFormModal
        open={open}
        nested={false}
        patientTitle={patientTitle('Новый симптом', patientName, patientOnSupport)}
        draft={complaintDraft}
        onDraft={setComplaintDraft}
        saving={saving}
        error={saveError}
        onClose={onClose}
        onSave={() => void save()}
        showSeverity
      />
    );
  }

  return (
    <DiagnosisFormModal
      open={open}
      nested={false}
      patientTitle={patientTitle('Новый диагноз', patientName, patientOnSupport)}
      draft={diagnosisDraft}
      onDraft={setDiagnosisDraft}
      saving={saving}
      error={saveError}
      onClose={onClose}
      onSave={() => void save()}
    />
  );
}

function ComplaintFormModal({
  open,
  nested,
  patientTitle: modalTitle,
  draft,
  onDraft,
  saving,
  error,
  onClose,
  onSave,
  showSeverity = false,
}: {
  open: boolean;
  nested: boolean;
  patientTitle: ReactNode;
  draft: ComplaintDraft;
  onDraft: (draft: ComplaintDraft) => void;
  saving: boolean;
  error: boolean;
  onClose: () => void;
  onSave: () => void;
  showSeverity?: boolean;
}) {
  return (
    <DoctorModal
      open={open}
      onClose={onClose}
      title={modalTitle}
      nested={nested}
      size="md"
      footer={
        <Button type="button" disabled={saving} onClick={onSave}>
          Сохранить
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <RequiredLabel>Симптом</RequiredLabel>
          <Input
            value={draft.text}
            onChange={(event) => onDraft({ ...draft, text: event.target.value })}
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <RequiredLabel>Описание</RequiredLabel>
          <Textarea
            value={draft.description}
            onChange={(event) => onDraft({ ...draft, description: event.target.value })}
          />
        </div>
        {showSeverity ? (
          <div className="space-y-1.5">
            <RequiredLabel>Выраженность, 0–10</RequiredLabel>
            <Input
              type="number"
              min={0}
              max={10}
              value={draft.severity}
              onChange={(event) => onDraft({ ...draft, severity: event.target.value })}
            />
          </div>
        ) : null}
        <PriorityControl
          checked={draft.priority}
          onChange={(priority) => onDraft({ ...draft, priority })}
        />
        <FormError visible={error} />
      </div>
    </DoctorModal>
  );
}

function DiagnosisFormModal({
  open,
  nested,
  patientTitle: modalTitle,
  draft,
  onDraft,
  saving,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  nested: boolean;
  patientTitle: ReactNode;
  draft: DiagnosisDraft;
  onDraft: (draft: DiagnosisDraft) => void;
  saving: boolean;
  error: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <DoctorModal
      open={open}
      onClose={onClose}
      title={modalTitle}
      nested={nested}
      size="md"
      footer={
        <Button type="button" disabled={saving} onClick={onSave}>
          Сохранить
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <RequiredLabel>Диагноз</RequiredLabel>
          <Input
            value={draft.text}
            onChange={(event) => onDraft({ ...draft, text: event.target.value })}
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <RequiredLabel>Комментарий</RequiredLabel>
          <Textarea
            value={draft.comment}
            onChange={(event) => onDraft({ ...draft, comment: event.target.value })}
          />
        </div>
        <PriorityControl
          checked={draft.priority}
          onChange={(priority) => onDraft({ ...draft, priority })}
        />
        <FormError visible={error} />
      </div>
    </DoctorModal>
  );
}

type AnamnesisModalSection = 'comorbidity' | 'trauma' | 'illness' | 'lifestyle';

/**
 * DISEASE-ANAMNESIS-01..05: «Анамнез заболевания» — отдельный белый блок после диагнозов, единый
 * patient-scoped текст (не биографический append-log анамнеза жизни ниже). Свёрнутое состояние —
 * максимум 5 строк, chevron только при фактическом overflow; редактор — следующий слой DoctorModal
 * с безрамочным полем ввода.
 */
function DiseaseAnamnesisSection({
  userId,
  patientName,
  patientOnSupport,
  text,
  loading,
  error,
  onRefresh,
}: {
  userId: string;
  patientName: string | null;
  patientOnSupport: boolean;
  text: string;
  loading: boolean;
  error: boolean;
  onRefresh: () => void;
}) {
  const isMobile = useIsMobileViewport();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(text);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const clampRef = useRef<HTMLParagraphElement>(null);

  // Overflow can only be measured against the collapsed (clamped) height; while expanded the
  // element has no clamp and scrollHeight === clientHeight, so the last collapsed measurement is
  // kept instead of being overwritten with a false "no overflow" reading.
  useLayoutEffect(() => {
    const el = clampRef.current;
    if (!el || expanded) return;
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [text, expanded]);
  const showChevron = overflowing || expanded;

  const openEditor = () => {
    setDraft(text);
    setSaveError(false);
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setSaveError(false);
    try {
      const response = await fetch(`/api/doctor/patients/${userId}/anamnesis`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'disease', text: draft }),
      });
      if (!response.ok) throw new Error();
      setOpen(false);
      toast.success('Сохранено');
      onRefresh();
    } catch {
      setSaveError(true);
      toast.error('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className={doctorSectionCardClass}>
        <div className="flex items-center justify-between gap-3">
          <h3 className={doctorSectionTitleClass}>Анамнез заболевания</h3>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Изменить анамнез заболевания"
            onClick={openEditor}
          >
            <SquarePen className="size-5" />
          </Button>
        </div>
        {loading ? <DoctorPanelLoading className="py-4" /> : null}
        {!loading && error ? (
          <p className="text-sm text-destructive">Не удалось загрузить анамнез заболевания.</p>
        ) : null}
        {!loading && !error ? (
          text ? (
            <div className="flex flex-col items-center gap-1">
              <p
                ref={clampRef}
                className={cn(
                  'w-full whitespace-pre-wrap text-[14px] font-normal text-foreground',
                  !expanded && 'line-clamp-5',
                )}
              >
                {text}
              </p>
              {showChevron ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={expanded ? 'Свернуть' : 'Показать полностью'}
                  onClick={() => setExpanded((value) => !value)}
                >
                  {expanded ? (
                    <ChevronUp className="size-4" />
                  ) : (
                    <ChevronDown className="size-4" />
                  )}
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )
        ) : null}
      </section>

      <DoctorModal
        open={open}
        onClose={() => setOpen(false)}
        title={patientTitle('Анамнез заболевания', patientName, patientOnSupport)}
        size="md"
        bodyClassName={cn('flex flex-col gap-2 p-4', isMobile ? 'justify-end' : 'justify-start')}
        footer={
          <Button type="button" disabled={saving} onClick={() => void save()}>
            Сохранить
          </Button>
        }
      >
        <FormError visible={saveError} />
        <DiseaseAnamnesisEditorTextarea value={draft} onChange={setDraft} />
      </DoctorModal>
    </>
  );
}

/** Безрамочное поле ввода (DISEASE-ANAMNESIS-04): без бордера/фона, высота растёт под текст. */
function DiseaseAnamnesisEditorTextarea({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Анамнез заболевания"
      rows={1}
      autoFocus
      className="w-full resize-none border-0 bg-transparent p-0 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0"
    />
  );
}

/**
 * LIFE-ANAMNESIS-01..03: «Анамнез жизни» — сопутствующие заболевания, травмы и операции, болезни
 * и стрессы, образ жизни. Подсекции видны сразу и не сворачиваются; правка переиспользует те же
 * typed contracts/форму, что и раньше (общий вложенный редактор одной записи).
 */
function LifeAnamnesisSection({
  userId,
  patientName,
  patientOnSupport,
  state,
  loading,
  error,
  onRefresh,
  initialComorbidities,
}: {
  userId: string;
  patientName: string | null;
  patientOnSupport: boolean;
  state: AnamnesisState;
  loading: boolean;
  error: boolean;
  onRefresh: () => void;
  initialComorbidities?: PatientClinicalComorbidity[];
}) {
  const [comorbidities, setComorbidities] = useState<PatientClinicalComorbidity[] | null>(
    initialComorbidities ?? null,
  );
  const [showComorbidityHistory, setShowComorbidityHistory] = useState(false);
  const [comorbiditiesIncludeHistory, setComorbiditiesIncludeHistory] = useState(false);
  const [comorbiditiesError, setComorbiditiesError] = useState(false);
  const [editor, setEditor] = useState<{ section: AnamnesisModalSection; id?: string } | null>(
    null,
  );
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const loadComorbidities = (includeHistory = comorbiditiesIncludeHistory) => {
    fetch(
      `/api/doctor/patients/${userId}/comorbidities?status=${includeHistory ? 'all' : 'active'}`,
      { credentials: 'include' },
    )
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{ comorbidities: PatientClinicalComorbidity[] }>;
      })
      .then((data) => {
        setComorbidities(data.comorbidities ?? []);
        setComorbiditiesIncludeHistory(includeHistory);
        setComorbiditiesError(false);
      })
      .catch(() => {
        setComorbidities([]);
        setComorbiditiesError(true);
      });
  };

  useEffect(() => {
    if (comorbidities !== null) return;
    loadComorbidities();
    // One request per patient until a mutation explicitly refreshes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, comorbidities]);

  const openEditor = (section: AnamnesisModalSection, item?: { id: string }) => {
    if (!item) {
      setDraft({});
      setEditor({ section });
      return;
    }
    if (section === 'comorbidity') {
      const value = comorbidities?.find((entry) => entry.id === item.id);
      setDraft({ text: value?.text ?? '', since: value?.since ?? '' });
    } else if (section === 'trauma') {
      const value = state.trauma.find((entry) => entry.id === item.id);
      setDraft({
        year: value?.year ?? '',
        what: value?.what ?? '',
        type: value?.type ?? '',
        immobilization: value?.immobilization ?? '',
      });
    } else if (section === 'illness') {
      const value = state.illness.find((entry) => entry.id === item.id);
      setDraft({
        period: value?.period ?? '',
        what: value?.what ?? '',
        comment: value?.comment ?? '',
      });
    } else {
      const value = state.lifestyle.find((entry) => entry.id === item.id);
      const parts = value?.date.split('.') ?? [];
      setDraft({
        recordDate: parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : '',
        text: value?.text ?? '',
      });
    }
    setEditor({ section, id: item.id });
  };

  const saveEditor = async () => {
    if (!editor) return;
    setSaving(true);
    try {
      if (editor.section === 'comorbidity') {
        const text = draft.text?.trim();
        if (!text) throw new Error();
        const base = `/api/doctor/patients/${userId}/comorbidities`;
        const response = await fetch(editor.id ? `${base}/${editor.id}` : base, {
          method: editor.id ? 'PATCH' : 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, since: draft.since?.trim() || null }),
        });
        if (!response.ok) throw new Error();
        loadComorbidities();
      } else {
        const payload = {
          section: editor.section,
          ...(editor.id ? { entryId: editor.id } : {}),
          ...draft,
        };
        const response = await fetch(`/api/doctor/patients/${userId}/anamnesis`, {
          method: editor.id ? 'PATCH' : 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error();
        onRefresh();
      }
      setEditor(null);
      toast.success('Сохранено');
    } catch {
      toast.error('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const archiveComorbidity = async () => {
    if (editor?.section !== 'comorbidity' || !editor.id) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/doctor/patients/${userId}/comorbidities/${editor.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error();
      setEditor(null);
      loadComorbidities(comorbiditiesIncludeHistory);
      toast.success('Заболевание перенесено в историю');
    } catch {
      toast.error('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const restoreComorbidity = async () => {
    if (editor?.section !== 'comorbidity' || !editor.id) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/doctor/patients/${userId}/comorbidities/${editor.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore' }),
      });
      if (!response.ok) throw new Error();
      setEditor(null);
      loadComorbidities(true);
      toast.success('Заболевание возвращено');
    } catch {
      toast.error('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const selectedComorbidity =
    editor?.section === 'comorbidity' && editor.id
      ? comorbidities?.find((item) => item.id === editor.id)
      : null;

  return (
    <>
      <section className={cn(doctorSectionCardClass, 'gap-0 overflow-hidden p-0')}>
        <h3 className={cn(doctorSectionTitleClass, 'px-[var(--doctor-block-padding,18px)] pt-[var(--doctor-block-padding,18px)]')}>
          Анамнез жизни
        </h3>
        {loading ? <DoctorPanelLoading className="py-4" /> : null}
        {!loading && (error || comorbiditiesError) ? (
          <p className="px-[var(--doctor-block-padding,18px)] pb-4 text-sm text-destructive">
            Не удалось загрузить анамнез жизни.
          </p>
        ) : null}
        {!loading && !error ? (
          <div className="mt-2">
            <AnamnesisListSection
              title="Сопутствующие заболевания"
              onAdd={() => openEditor('comorbidity')}
              history={showComorbidityHistory}
              onHistoryChange={() => {
                setShowComorbidityHistory((value) => !value);
                if (!comorbiditiesIncludeHistory) loadComorbidities(true);
              }}
              items={(comorbidities ?? [])
                .filter((item) =>
                  showComorbidityHistory ? item.status === 'removed' : item.status === 'active',
                )
                .map((item) => ({
                  id: item.id,
                  primary: item.text,
                  secondary: item.since,
                }))}
              onOpen={(id) => openEditor('comorbidity', { id })}
            />
            <AnamnesisListSection
              title="Травмы и операции"
              onAdd={() => openEditor('trauma')}
              items={state.trauma.map((item) => ({
                id: item.id,
                primary: item.what,
                secondary: [item.year, item.type, item.immobilization].filter(Boolean).join(' · '),
              }))}
              onOpen={(id) => openEditor('trauma', { id })}
            />
            <AnamnesisListSection
              title="Болезни, стрессы"
              onAdd={() => openEditor('illness')}
              items={state.illness.map((item) => ({
                id: item.id,
                primary: item.what,
                secondary: [item.period, item.comment].filter(Boolean).join(' · '),
              }))}
              onOpen={(id) => openEditor('illness', { id })}
            />
            <AnamnesisListSection
              title="Образ жизни"
              onAdd={() => openEditor('lifestyle')}
              items={state.lifestyle.map((item) => ({
                id: item.id,
                primary: item.text,
                secondary: item.date,
              }))}
              onOpen={(id) => openEditor('lifestyle', { id })}
            />
          </div>
        ) : null}
      </section>

      <DoctorModal
        open={editor !== null}
        onClose={() => setEditor(null)}
        title={patientTitle(
          editor?.id ? 'Изменить запись' : 'Новая запись',
          patientName,
          patientOnSupport,
        )}
        size="md"
        footer={
          <>
            {selectedComorbidity?.status === 'removed' ? (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => void restoreComorbidity()}
              >
                Вернуть
              </Button>
            ) : editor?.section === 'comorbidity' && editor.id ? (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => void archiveComorbidity()}
              >
                В историю
              </Button>
            ) : null}
            <Button type="button" disabled={saving} onClick={() => void saveEditor()}>
              Сохранить
            </Button>
          </>
        }
      >
        {editor ? (
          <AnamnesisEditorFields section={editor.section} draft={draft} onDraft={setDraft} />
        ) : null}
      </DoctorModal>
    </>
  );
}

function AnamnesisListSection({
  title,
  items,
  onAdd,
  onOpen,
  history,
  onHistoryChange,
}: {
  title: string;
  items: Array<{ id: string; primary: string; secondary: string | null }>;
  onAdd: () => void;
  onOpen: (id: string) => void;
  history?: boolean;
  onHistoryChange?: () => void;
}) {
  const hasItems = items.length > 0;
  return (
    <section className="border-b border-border last:border-b-0">
      <div className="flex items-center justify-between px-[var(--doctor-list-inline-padding,18px)] py-2.5">
        {/* LIFE-ANAMNESIS-02: заполненный заголовок чёрный, пустой — приглушённый серый. */}
        <h4
          className={cn(
            'text-[15px] font-semibold',
            hasItems ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {title}
        </h4>
        <div className="flex items-center gap-1.5">
          {onHistoryChange ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={history}
              className={cn(
                'h-8 px-2.5 text-sm font-normal',
                history && 'border-primary bg-primary/5 text-primary hover:bg-primary/10',
              )}
              onClick={onHistoryChange}
            >
              История
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onAdd}
            title={`Добавить: ${title}`}
          >
            <Plus className="size-5" />
          </Button>
        </div>
      </div>
      {!hasItems ? (
        <p className="px-[var(--doctor-list-inline-padding,18px)] pb-3 text-sm text-muted-foreground">
          —
        </p>
      ) : (
        <DoctorDnaFlatList>
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={cn(
                  doctorDnaFlatListRowClass,
                  doctorDnaFlatListClickableClass,
                  'w-full items-start text-left',
                )}
                onClick={() => onOpen(item.id)}
              >
                <span className="min-w-0 flex-1">
                  <span className={doctorDnaFlatListPrimaryClass}>{item.primary}</span>
                  {item.secondary ? (
                    <span className={cn(doctorDnaFlatListMetaClass, 'mt-0.5')}>
                      {item.secondary}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </DoctorDnaFlatList>
      )}
    </section>
  );
}

function AnamnesisEditorFields({
  section,
  draft,
  onDraft,
}: {
  section: AnamnesisModalSection;
  draft: Record<string, string>;
  onDraft: (draft: Record<string, string>) => void;
}) {
  const field = (key: string, label: string) => (
    <div className="space-y-1.5">
      <RequiredLabel>{label}</RequiredLabel>
      <Input
        value={draft[key] ?? ''}
        onChange={(event) => onDraft({ ...draft, [key]: event.target.value })}
      />
    </div>
  );
  if (section === 'comorbidity')
    return (
      <div className="space-y-4">
        {field('text', 'Сопутствующее заболевание')}
        {field('since', 'С какого времени')}
      </div>
    );
  if (section === 'trauma')
    return (
      <div className="space-y-4">
        {field('year', 'Год или период')}
        {field('what', 'Травма или операция')}
        {field('type', 'Тип')}
        {field('immobilization', 'Иммобилизация / восстановление')}
      </div>
    );
  if (section === 'illness')
    return (
      <div className="space-y-4">
        {field('period', 'Период')}
        {field('what', 'Болезнь или стресс')}
        <div className="space-y-1.5">
          <RequiredLabel>Комментарий</RequiredLabel>
          <Textarea
            value={draft.comment ?? ''}
            onChange={(event) => onDraft({ ...draft, comment: event.target.value })}
          />
        </div>
      </div>
    );
  return (
    <div className="space-y-4">
      {field('recordDate', 'Дата')}
      <div className="space-y-1.5">
        <RequiredLabel>Образ жизни</RequiredLabel>
        <Textarea
          value={draft.text ?? ''}
          onChange={(event) => onDraft({ ...draft, text: event.target.value })}
        />
      </div>
    </div>
  );
}
