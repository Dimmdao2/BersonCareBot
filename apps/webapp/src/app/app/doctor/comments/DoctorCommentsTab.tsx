'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { DoctorPatientName } from '@/shared/ui/doctor/DoctorSupportStar';
import { DoctorSupportQuickFilterButton } from '@/shared/ui/doctor/DoctorSupportQuickFilterButton';
import { useDoctorPatientTerms } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';
import type { TodayExerciseCommentAttentionItem } from '../loadDoctorExerciseCommentAttention';
import type { DoctorExerciseCommentCursor } from '@/modules/program-item-discussion/types';
import type { CommentPatientRow } from './loadDoctorCommentPatients';
import {
  DoctorDnaFlatListSelectionStrip,
  doctorDnaFlatListClass,
  doctorDnaFlatListClickableClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
  doctorDnaFlatListSelectedPrimaryClass,
  doctorDnaFlatListUnreadTextClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorSearchInput } from '@/shared/ui/doctor/DoctorSearchInput';
import { CatalogSplitLayout } from '@/shared/ui/doctor/catalog/CatalogSplitLayout';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { DoctorAttentionBadge } from '@/shared/ui/doctor/DoctorAttentionBadge';
import { DOCTOR_REMAINING_HEIGHT_SPLIT_LAYOUT_CLASS } from '@/shared/ui/doctor/doctorWorkspaceLayout';
import { DoctorLfkCommentsModal } from './DoctorLfkCommentsModal';

// ── Types ────────────────────────────────────────────────────────────────────

export type DoctorCommentsTabProps = {
  initialItems: TodayExerciseCommentAttentionItem[];
  initialCursor: DoctorExerciseCommentCursor | null;
  hasMoreInitial: boolean;
  initialPatients: CommentPatientRow[];
  /** IANA timezone string for displaying dates in clinic's local time. */
  displayIana?: string;
  active?: boolean;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function filterPatients(patients: CommentPatientRow[], query: string): CommentPatientRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return patients;
  return patients.filter((p) => {
    if (p.displayName.toLowerCase().includes(q)) return true;
    if (p.phone?.toLowerCase().includes(q)) return true;
    if (p.telegramId?.toLowerCase().includes(q)) return true;
    if (p.maxId?.toLowerCase().includes(q)) return true;
    return false;
  });
}

// ── Left pane: patient row ───────────────────────────────────────────────────

function PatientRow({
  patient,
  isSelected,
  onClick,
  isFirst,
}: {
  patient: CommentPatientRow;
  isSelected: boolean;
  onClick: () => void;
  isFirst: boolean;
}) {
  const hasUnread = patient.unreadCount > 0;
  return (
    <li>
      <Button
        type="button"
        variant="ghost"
        onClick={onClick}
        className={cn(
          doctorDnaFlatListRowClass,
          doctorDnaFlatListClickableClass,
          'h-auto min-h-12 w-full rounded-none bg-transparent text-left shadow-none',
          isFirst && 'border-t-0',
        )}
        aria-pressed={isSelected}
      >
        {isSelected ? <DoctorDnaFlatListSelectionStrip /> : null}
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-baseline justify-between gap-1.5">
            {/* Имя: жирное если есть непрочитанные, обычное если всё прочитано */}
            <DoctorPatientName
              isOnSupport={patient.isOnSupport}
              className={cn(
                'min-w-0 truncate',
                doctorDnaFlatListPrimaryClass,
                hasUnread && doctorDnaFlatListUnreadTextClass,
                isSelected && doctorDnaFlatListSelectedPrimaryClass,
              )}
            >
              {patient.displayName}
            </DoctorPatientName>
            <DoctorAttentionBadge count={patient.unreadCount} className="shrink-0" />
          </div>
        </div>
      </Button>
    </li>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * Страница «Комментарии» нижнего меню.
 *
 * Список пациентов — единственный собственный экран таба. Тап по пациенту открывает общую
 * модалку «Комментарии к ЛФК», тап по упражнению внутри неё — общую модалку упражнения.
 * Прежний drill-down правым пейном (упражнения + тред + отдельный график) удалён: у
 * комментариев ЛФК один путь на весь кабинет.
 */
function DoctorCommentsPatientsTab({ initialPatients, active = true }: DoctorCommentsTabProps) {
  const { patientGenPlural, patientSingularLower } = useDoctorPatientTerms();

  // ── «Сопровождение» — быстрый toggle-фильтр (не визуальный маркер).
  const [onSupportOnly, setOnSupportOnly] = useState(false);

  // ── Search / filter state ──
  const [query, setQuery] = useState('');
  const [mobileToolbarTarget, setMobileToolbarTarget] = useState<HTMLElement | null>(null);

  // ── All-mode: lazy-loaded patients ──
  const [allModePatients, setAllModePatients] = useState<CommentPatientRow[] | null>(null);
  const [allModePatientsLoading, setAllModePatientsLoading] = useState(false);
  const [allModePatientsError, setAllModePatientsError] = useState<string | null>(null);
  const allModeFetchedRef = useRef(false);

  // ── Выбранный пациент = открытая модалка «Комментарии к ЛФК» ──
  const [selectedPatient, setSelectedPatient] = useState<CommentPatientRow | null>(null);

  // Локальная копия списка пациентов: server-данные + декремент unreadCount по мере чтения,
  // чтобы бейджи сходились без рефетча.
  const [patients, setPatients] = useState<CommentPatientRow[]>(initialPatients ?? []);
  useEffect(() => {
    setPatients(initialPatients ?? []);
  }, [initialPatients]);

  const refreshUnreadPatients = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    try {
      const response = await fetch('/api/doctor/comments/patients?mode=unread', {
        cache: 'no-store',
      });
      const data = (await response.json()) as {
        ok?: boolean;
        patients?: CommentPatientRow[];
      };
      if (!response.ok || !data.ok || !Array.isArray(data.patients)) return;
      const nextUnreadPatients = data.patients;
      setPatients(nextUnreadPatients);
      setAllModePatients((current) => {
        if (!current) return current;
        const unreadByPatientId = new Map(
          nextUnreadPatients.map((patient) => [patient.patientUserId, patient]),
        );
        const currentIds = new Set(current.map((patient) => patient.patientUserId));
        return [
          ...nextUnreadPatients.filter((patient) => !currentIds.has(patient.patientUserId)),
          ...current.map((patient) => ({
            ...patient,
            unreadCount: unreadByPatientId.get(patient.patientUserId)?.unreadCount ?? 0,
          })),
        ];
      });
    } catch {
      // Keep the current list stable during a transient polling failure.
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const intervalId = window.setInterval(() => void refreshUnreadPatients(), 8_000);
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void refreshUnreadPatients();
    };
    document.addEventListener('visibilitychange', refreshVisible);
    window.addEventListener('focus', refreshVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshVisible);
      window.removeEventListener('focus', refreshVisible);
    };
  }, [active, refreshUnreadPatients]);

  // ── Fetch all-mode patients ──
  const fetchAllMode = useCallback(async () => {
    if (allModeFetchedRef.current) return;
    allModeFetchedRef.current = true;

    setAllModePatientsLoading(true);
    setAllModePatientsError(null);
    try {
      const res = await fetch('/api/doctor/comments/patients?mode=all');
      const data = (await res.json()) as {
        ok: boolean;
        patients?: CommentPatientRow[];
        error?: string;
      };
      if (data.ok && data.patients) {
        setAllModePatients(data.patients);
      } else {
        setAllModePatientsError(`Не удалось загрузить список ${patientGenPlural}.`);
        allModeFetchedRef.current = false; // allow retry
      }
    } catch {
      setAllModePatientsError('Ошибка сети. Попробуйте ещё раз.');
      allModeFetchedRef.current = false;
    } finally {
      setAllModePatientsLoading(false);
    }
  }, [patientGenPlural]);

  // Полная выборка пациентов грузится всегда — она нужна как активный датасет
  // в режиме «Все» и как стабильный источник счётчиков для обоих toggle-фильтров
  // независимо от того, какой из них сейчас активен.
  useEffect(() => {
    void fetchAllMode();
  }, [fetchAllMode]);

  // The full list is the visible dataset; the SSR unread rows are a stable fallback while it loads.
  const activePatients = allModePatients ?? patients;
  const onSupportFilteredPatients = onSupportOnly
    ? activePatients.filter((p) => p.isOnSupport)
    : activePatients;
  const patientsToShow = filterPatients(onSupportFilteredPatients, query);

  /** Тред прочитан внутри модалки — гасим ровно столько непрочитанных у пациента. */
  const applyPatientUnreadCleared = useCallback((patientUserId: string, clearedUnread: number) => {
    if (clearedUnread <= 0) return;
    const decrement = (list: CommentPatientRow[]) =>
      list.map((p) =>
        p.patientUserId === patientUserId
          ? { ...p, unreadCount: Math.max(0, p.unreadCount - clearedUnread) }
          : p,
      );
    setPatients(decrement);
    setAllModePatients((current) => (current ? decrement(current) : current));
  }, []);

  // ── Left pane ────────────────────────────────────────────────────────────

  function handleToggleOnSupportOnly() {
    setSelectedPatient(null);
    setOnSupportOnly((v) => !v);
  }

  const patientsLoading = allModePatients === null && allModePatientsLoading;
  const patientsError = allModePatients === null ? allModePatientsError : null;

  useEffect(() => {
    if (!active) {
      setMobileToolbarTarget(null);
      return;
    }
    setMobileToolbarTarget(document.getElementById('doctor-communications-mobile-toolbar'));
  }, [active]);

  const renderListControls = () => (
    <div className="flex min-w-0 items-center gap-1.5">
      <DoctorSearchInput
        placeholder="Поиск"
        value={query}
        onValueChange={setQuery}
        onClear={() => setQuery('')}
        aria-label={`Поиск ${patientGenPlural}`}
      />
      <DoctorSupportQuickFilterButton active={onSupportOnly} onClick={handleToggleOnSupportOnly} />
    </div>
  );

  const leftPane = (
    <div
      data-doctor-flat-list-surface
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0 bg-card md:rounded-lg md:border md:border-border"
    >
      {/* Search + filters header */}
      <div className="hidden shrink-0 space-y-1.5 border-b border-border bg-muted/20 px-3 py-2 md:block">
        {renderListControls()}
      </div>

      {/* Patient list */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {patientsLoading ? (
          <DoctorPanelLoading />
        ) : patientsError ? (
          <DoctorEmptyState
            size="xs"
            className="flex flex-1 items-center justify-center py-6 text-destructive"
          >
            {patientsError}
          </DoctorEmptyState>
        ) : patientsToShow.length === 0 ? (
          <DoctorEmptyState size="xs" className="flex flex-1 items-center justify-center py-6">
            {query.trim() ? 'Ничего не найдено' : `Нет ${patientGenPlural} с комментариями`}
          </DoctorEmptyState>
        ) : (
          <ul className={doctorDnaFlatListClass}>
            {patientsToShow.map((patient, index) => (
              <PatientRow
                key={patient.patientUserId}
                patient={patient}
                isSelected={selectedPatient?.patientUserId === patient.patientUserId}
                onClick={() => setSelectedPatient(patient)}
                isFirst={index === 0}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  // Комментарии пациента живут в модалке, поэтому правый пейн остаётся подсказкой выбора.
  const rightPane = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <DoctorEmptyState size="sm" className="flex flex-1 items-center justify-center py-10">
        Выберите {patientSingularLower}, чтобы открыть комментарии
      </DoctorEmptyState>
    </div>
  );

  return (
    <>
      {mobileToolbarTarget ? createPortal(renderListControls(), mobileToolbarTarget) : null}
      <CatalogSplitLayout
        mobileEdgeToEdge
        left={leftPane}
        right={rightPane}
        mobileView="list"
        desktopColsClassName="lg:grid-cols-[minmax(0,9fr)_minmax(0,11fr)]"
        className={DOCTOR_REMAINING_HEIGHT_SPLIT_LAYOUT_CLASS}
      />
      <DoctorLfkCommentsModal
        open={selectedPatient !== null}
        onClose={() => setSelectedPatient(null)}
        patientUserId={selectedPatient?.patientUserId ?? null}
        patientName={selectedPatient?.displayName ?? ''}
        patientOnSupport={selectedPatient?.isOnSupport === true}
        onUnreadCleared={({ unreadCount }) => {
          if (!selectedPatient) return;
          applyPatientUnreadCleared(selectedPatient.patientUserId, unreadCount);
        }}
      />
    </>
  );
}

export function DoctorCommentsTab(props: DoctorCommentsTabProps) {
  return <DoctorCommentsPatientsTab {...props} />;
}
