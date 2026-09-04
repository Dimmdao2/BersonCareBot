'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { DoctorSupportStar } from '@/shared/ui/doctor/DoctorSupportStar';
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
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Button } from '@/shared/ui/doctor/primitives/button';
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
            <span
              className={cn(
                'min-w-0 truncate',
                doctorDnaFlatListPrimaryClass,
                hasUnread && doctorDnaFlatListUnreadTextClass,
                isSelected && doctorDnaFlatListSelectedPrimaryClass,
              )}
            >
              {patient.displayName}
              {/* ★ = на сопровождении (визуальный маркер, НЕ фильтр) */}
              {patient.isOnSupport && <DoctorSupportStar />}
            </span>
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
  // ── View mode: «Непрочитанные» (unread) or «Все» (all) ──
  // Default: «Все» — показать всю историю комментариев; «Непрочитанные» — только непрочитанные.
  const [viewMode, setViewMode] = useState<'unread' | 'all'>('all');

  // ── «На сопровождении» — независимый toggle-фильтр (не визуальный маркер).
  // Комбинируется с viewMode: оба фильтра действуют независимо друг от друга.
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
        setAllModePatientsError('Не удалось загрузить список пациентов.');
        allModeFetchedRef.current = false; // allow retry
      }
    } catch {
      setAllModePatientsError('Ошибка сети. Попробуйте ещё раз.');
      allModeFetchedRef.current = false;
    } finally {
      setAllModePatientsLoading(false);
    }
  }, []);

  // Полная выборка пациентов грузится всегда — она нужна как активный датасет
  // в режиме «Все» и как стабильный источник счётчиков для обоих toggle-фильтров
  // независимо от того, какой из них сейчас активен.
  useEffect(() => {
    void fetchAllMode();
  }, [fetchAllMode]);

  // ── Computed: patients list for left pane, depends on viewMode ──
  // In "unread" mode: SSR-provided patients (already filtered to unreadCount>0).
  // In "all" mode: lazy-fetched allModePatients (all on-support with any comment).
  const activePatients = viewMode === 'all' ? (allModePatients ?? []) : patients;
  // «На сопровождении» — независимый toggle-фильтр (комбинируется с viewMode, а не заменяет его).
  const onSupportFilteredPatients = onSupportOnly
    ? activePatients.filter((p) => p.isOnSupport)
    : activePatients;
  const patientsToShowRaw = filterPatients(onSupportFilteredPatients, query);
  // «Непрочитанные» mode: keep only patients with unread, but always keep selected patient
  // so it doesn't disappear from under the cursor while the doctor is reading.
  // «Все» mode: show all patients that have any comment (unreadCount may be 0).
  const patientsToShow =
    viewMode === 'unread'
      ? patientsToShowRaw.filter(
          (p) => p.unreadCount > 0 || p.patientUserId === selectedPatient?.patientUserId,
        )
      : patientsToShowRaw;

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

  // Стабильный источник счётчиков для обоих toggle-фильтров (полная выборка,
  // не зависит от того, какой из фильтров сейчас активен) — иначе счётчик
  // «прыгал» бы при переключении соседнего фильтра.
  const badgeCountSource = allModePatients ?? patients;
  const totalUnread = badgeCountSource.reduce((s, p) => s + p.unreadCount, 0);
  const onSupportCount = badgeCountSource.filter((p) => p.isOnSupport).length;

  // Handle view mode switch: reset navigation + query, then switch mode.
  function handleSwitchViewMode(mode: 'unread' | 'all') {
    if (mode === viewMode) return;
    setSelectedPatient(null);
    setQuery('');
    setViewMode(mode);
  }

  function handleToggleOnSupportOnly() {
    setSelectedPatient(null);
    setOnSupportOnly((v) => !v);
  }

  // Loading/error state for left pane in "all" mode
  const patientsLoading = viewMode === 'all' && allModePatientsLoading;
  const patientsError = viewMode === 'all' ? allModePatientsError : null;

  useEffect(() => {
    if (!active) {
      setMobileToolbarTarget(null);
      return;
    }
    setMobileToolbarTarget(document.getElementById('doctor-communications-mobile-toolbar'));
  }, [active]);

  const renderListControls = (showFilters: boolean) => (
    <div className="space-y-1.5">
      <Input
        type="search"
        placeholder="Поиск"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-8 w-full"
        aria-label="Поиск пациентов"
      />
      {showFilters ? (
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleSwitchViewMode(viewMode === 'unread' ? 'all' : 'unread')}
            className={cn(
              'h-auto cursor-pointer rounded-md px-2 py-1 text-xs font-medium transition-colors',
              viewMode === 'unread'
                ? 'bg-destructive/15 text-destructive'
                : 'border border-border text-muted-foreground hover:bg-muted/40',
            )}
            aria-pressed={viewMode === 'unread'}
          >
            Непрочитанные{totalUnread > 0 ? ` ${totalUnread}` : ''}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleToggleOnSupportOnly}
            className={cn(
              'h-auto cursor-pointer rounded-md px-2 py-1 text-xs font-medium transition-colors',
              onSupportOnly
                ? 'bg-primary/15 text-primary'
                : 'border border-border text-muted-foreground hover:bg-muted/40',
            )}
            aria-pressed={onSupportOnly}
          >
            ★ На сопровождении{onSupportCount > 0 ? ` ${onSupportCount}` : ''}
          </Button>
        </div>
      ) : null}
    </div>
  );

  const leftPane = (
    <div
      data-doctor-flat-list-surface
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0 bg-card md:rounded-lg md:border md:border-border"
    >
      {/* Search + filters header */}
      <div className="hidden shrink-0 space-y-1.5 border-b border-border bg-muted/20 px-3 py-2 md:block">
        {renderListControls(true)}
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
            {query.trim()
              ? 'Ничего не найдено'
              : viewMode === 'all'
                ? 'Нет пациентов с комментариями'
                : 'Нет пациентов с непрочитанными комментариями'}
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
        Выберите клиента, чтобы открыть комментарии
      </DoctorEmptyState>
    </div>
  );

  return (
    <>
      {mobileToolbarTarget ? createPortal(renderListControls(false), mobileToolbarTarget) : null}
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
