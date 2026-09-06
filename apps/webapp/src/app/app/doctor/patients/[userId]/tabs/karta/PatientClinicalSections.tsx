'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FilePlus2, HeartPlus, Plus, SquarePen } from 'lucide-react';
import toast from 'react-hot-toast';
import type {
  ActiveComplaint,
  ActiveDiagnosis,
  AnamnesisState,
  DiagnosisClinicalStatus,
} from '@/modules/patient-clinical/ports';
import { cn } from '@/lib/utils';
import { patientCardHref } from '@/app/app/doctor/patients/patientCardHref';
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
  userId: string,
  patientOnSupport: boolean,
  entity?: ReactNode,
) {
  return (
    <DoctorModalStackedTitle
      label={label}
      entity={entity}
      patientName={patientName}
      patientHref={patientCardHref(userId)}
      patientOnSupport={patientOnSupport}
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

  const createComplaint = async () => {
    const text = complaintDraft.text.trim();
    const severity = Number(complaintDraft.severity);
    if (!text || !Number.isInteger(severity) || severity < 0 || severity > 10) {
      setSaveError(true);
      return;
    }
    const ok = await request(`/api/doctor/patients/${userId}/complaints`, 'POST', {
      text,
      description: complaintDraft.description.trim() || null,
      priority: complaintDraft.priority,
      severity,
    });
    if (!ok) return;
    setComplaintAddOpen(false);
    setComplaintDraft(EMPTY_COMPLAINT);
    toast.success('Симптом добавлен');
    onClinicalRefresh();
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

  const createDiagnosis = async () => {
    const text = diagnosisDraft.text.trim();
    if (!text) {
      setSaveError(true);
      return;
    }
    const ok = await request(`/api/doctor/patients/${userId}/diagnoses`, 'POST', {
      text,
      priority: diagnosisDraft.priority,
      comment: diagnosisDraft.comment.trim() || null,
    });
    if (!ok) return;
    setDiagnosisAddOpen(false);
    setDiagnosisDraft(EMPTY_DIAGNOSIS);
    toast.success('Диагноз добавлен');
    onClinicalRefresh();
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

      <AnamnesisSection
        userId={userId}
        patientName={patientName}
        patientOnSupport={patientOnSupport}
        state={anamnesis}
        loading={anamnesisLoading}
        error={anamnesisError}
        onRefresh={onAnamnesisRefresh}
        initialComorbidities={initialComorbidities}
      />

      <ComplaintFormModal
        open={complaintAddOpen}
        nested={false}
        patientTitle={patientTitle('Новый симптом', patientName, userId, patientOnSupport)}
        draft={complaintDraft}
        onDraft={setComplaintDraft}
        saving={saving}
        error={saveError}
        onClose={() => setComplaintAddOpen(false)}
        onSave={() => void createComplaint()}
        showSeverity
      />

      <DoctorModal
        open={selectedComplaint !== null}
        onClose={() => setSelectedComplaint(null)}
        title={patientTitle(
          'Симптом',
          patientName,
          userId,
          patientOnSupport,
          selectedComplaint?.text,
        )}
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
        patientTitle={patientTitle('Изменить симптом', patientName, userId, patientOnSupport)}
        draft={complaintDraft}
        onDraft={setComplaintDraft}
        saving={saving}
        error={saveError}
        onClose={() => setComplaintEditOpen(false)}
        onSave={() => void saveComplaint()}
      />

      <DiagnosisFormModal
        open={diagnosisAddOpen}
        nested={false}
        patientTitle={patientTitle('Новый диагноз', patientName, userId, patientOnSupport)}
        draft={diagnosisDraft}
        onDraft={setDiagnosisDraft}
        saving={saving}
        error={saveError}
        onClose={() => setDiagnosisAddOpen(false)}
        onSave={() => void createDiagnosis()}
      />

      <DoctorModal
        open={selectedDiagnosis !== null}
        onClose={() => setSelectedDiagnosis(null)}
        title={patientTitle(
          'Диагноз',
          patientName,
          userId,
          patientOnSupport,
          selectedDiagnosis?.text,
        )}
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
        patientTitle={patientTitle('Изменить диагноз', patientName, userId, patientOnSupport)}
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

function AnamnesisSection({
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
  const [open, setOpen] = useState(false);
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

  const summary = useMemo(
    () => [
      [
        'Сопутствующие заболевания',
        comorbidities
          ?.filter((item) => item.status === 'active')
          .map((item) => item.text)
          .join(', ') || '—',
      ],
      ['Травмы и операции', state.trauma.map((item) => item.what).join(', ') || '—'],
      ['Болезни, стрессы', state.illness.map((item) => item.what).join(', ') || '—'],
      ['Образ жизни', state.lifestyle.at(-1)?.text || '—'],
    ],
    [comorbidities, state],
  );

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
      <section className={doctorSectionCardClass}>
        <div className="flex items-center justify-between gap-3">
          <h3 className={doctorSectionTitleClass}>Анамнез</h3>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Изменить анамнез"
            onClick={() => setOpen(true)}
          >
            <SquarePen className="size-5" />
          </Button>
        </div>
        {loading ? <DoctorPanelLoading className="py-4" /> : null}
        {!loading && (error || comorbiditiesError) ? (
          <p className="text-sm text-destructive">Не удалось загрузить анамнез.</p>
        ) : null}
        {!loading && !error ? (
          <dl className="space-y-2">
            {summary.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[14px] font-semibold text-foreground">{label}</dt>
                <dd className="text-[14px] font-normal text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>

      <DoctorModal
        open={open}
        onClose={() => setOpen(false)}
        title={patientTitle('Анамнез', patientName, userId, patientOnSupport)}
        size="lg"
        bodyVariant="list"
      >
        <div className="bg-card">
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
      </DoctorModal>

      <DoctorModal
        open={editor !== null}
        onClose={() => setEditor(null)}
        nested
        title={patientTitle(
          editor?.id ? 'Изменить запись' : 'Новая запись',
          patientName,
          userId,
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
  return (
    <section className="border-b border-border last:border-b-0">
      <div className="flex items-center justify-between px-[var(--doctor-list-inline-padding,18px)] py-2.5">
        <h4 className="text-[15px] font-semibold">{title}</h4>
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
      {items.length === 0 ? (
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
