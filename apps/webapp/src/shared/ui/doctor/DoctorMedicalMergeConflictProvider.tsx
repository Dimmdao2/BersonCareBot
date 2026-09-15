'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { AlertTriangle } from 'lucide-react';
import type { PatientMergeConflictDetails } from '@/modules/patient-merge-candidate/ports';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import { Button } from '@/shared/ui/doctor/primitives/button';
import {
  doctorBodyTextClass,
  doctorMetaTextClass,
  doctorSectionTitleClass,
} from '@/shared/ui/doctor/doctorVisual';
import { cn } from '@/lib/utils';
import { notificationText } from '@/shared/notifications/notificationText';

type MedicalConflictSummary = {
  conflictIds: string[];
  clientIds: string[];
  conflicts: Array<{ id: string; clientIds: string[] }>;
};

type DoctorMedicalMergeConflictContextValue = {
  count: number;
  hasConflictForClient: (userId: string) => boolean;
  conflictIdForClient: (userId: string) => string | null;
  openConflict: (conflictId: string) => void;
  refresh: () => Promise<void>;
};

const DoctorMedicalMergeConflictContext = createContext<
  DoctorMedicalMergeConflictContextValue | undefined
>(undefined);

function parseSummary(value: unknown): MedicalConflictSummary | null {
  if (value === null || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (
    row.ok !== true ||
    !Array.isArray(row.conflictIds) ||
    !Array.isArray(row.clientIds) ||
    !Array.isArray(row.conflicts)
  )
    return null;
  if (!row.conflictIds.every((id) => typeof id === 'string')) return null;
  if (!row.clientIds.every((id) => typeof id === 'string')) return null;
  const conflicts = row.conflicts.flatMap((conflict) => {
    if (conflict === null || typeof conflict !== 'object') return [];
    const item = conflict as Record<string, unknown>;
    if (typeof item.id !== 'string' || !Array.isArray(item.clientIds)) return [];
    if (!item.clientIds.every((id) => typeof id === 'string')) return [];
    return [{ id: item.id, clientIds: item.clientIds }];
  });
  if (conflicts.length !== row.conflicts.length) return null;
  return { conflictIds: row.conflictIds, clientIds: row.clientIds, conflicts };
}

function formatDateTime(value: string | null): string {
  if (!value) return 'нет данных';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'нет данных';
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function assignmentKindLabel(kind: 'treatment_program' | 'lfk_assignment'): string {
  return kind === 'treatment_program' ? 'Программа лечения' : 'Комплекс ЛФК';
}

function ConflictDetails({ conflict }: { conflict: PatientMergeConflictDetails }) {
  return (
    <div className="flex flex-col gap-3">
      {conflict.doctorApproved ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-foreground">
          Решение этой клиники записано. Слияние ждёт решения другой клиники.
        </div>
      ) : null}
      {conflict.parties.map((party, index) => (
        <section key={party.userId} className="rounded-lg border border-border bg-muted/15 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <div className="min-w-0">
              <h3 className={doctorSectionTitleClass}>Учётная запись {index + 1}</h3>
              <p className={cn(doctorBodyTextClass, 'mt-1 break-words')}>
                {party.displayName || 'Без имени'}
              </p>
              <p className={cn(doctorMetaTextClass, 'mt-1')}>
                Последняя активность: {formatDateTime(party.lastActivityAt)}
              </p>
            </div>
          </div>
          <div className="mt-3 border-t border-border/60 pt-2">
            <p className={doctorMetaTextClass}>Назначения</p>
            {party.assignments.length ? (
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {party.assignments.map((assignment) => (
                  <li
                    key={assignment.id}
                    className={cn(doctorBodyTextClass, 'flex flex-col gap-0.5')}
                  >
                    <span>{assignment.title}</span>
                    <span className={doctorMetaTextClass}>
                      {assignmentKindLabel(assignment.kind)} ·{' '}
                      {formatDateTime(assignment.assignedAt)} · {assignment.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={cn(doctorMetaTextClass, 'mt-1.5')}>Назначений нет</p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function DoctorMedicalMergeConflictModal({
  conflictId,
  onClose,
  onChanged,
}: {
  conflictId: string | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [conflict, setConflict] = useState<PatientMergeConflictDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<'merge' | 'refuse' | null>(null);

  const load = useCallback(async () => {
    if (!conflictId) return;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/doctor/account-merge-conflicts/${encodeURIComponent(conflictId)}`,
        {
          credentials: 'include',
          cache: 'no-store',
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        conflict?: PatientMergeConflictDetails;
      } | null;
      if (!response.ok || payload?.ok !== true || !payload.conflict) {
        setConflict(null);
        toast.error(notificationText.doctorMedicalConflictUnavailable);
        return;
      }
      setConflict(payload.conflict);
    } catch {
      setConflict(null);
      toast.error(notificationText.doctorMedicalConflictLoadFailed);
    } finally {
      setLoading(false);
    }
  }, [conflictId]);

  useEffect(() => {
    setConflict(null);
    if (conflictId) void load();
  }, [conflictId, load]);

  const act = useCallback(
    async (action: 'merge' | 'refuse') => {
      if (!conflictId) return;
      setBusy(action);
      try {
        const response = await fetch(
          `/api/doctor/account-merge-conflicts/${encodeURIComponent(conflictId)}`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
          },
        );
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;
        if (action === 'merge' && response.ok && payload?.ok === true) {
          toast.success(notificationText.doctorMedicalConflictMerged);
          await onChanged();
          onClose();
          return;
        }
        if (action === 'refuse' && response.ok && payload?.ok === true) {
          toast.success(notificationText.doctorMedicalConflictEscalated);
          await onChanged();
          onClose();
          return;
        }
        if (
          action === 'merge' &&
          response.status === 409 &&
          payload?.error === 'awaiting_other_organization'
        ) {
          toast.success(notificationText.doctorMedicalConflictAwaitingOtherOrganization);
          await onChanged();
          await load();
          return;
        }
        toast.error(notificationText.doctorMedicalConflictUnavailable);
        await onChanged();
        onClose();
      } catch {
        toast.error(notificationText.doctorMedicalConflictActionFailed);
      } finally {
        setBusy(null);
      }
    },
    [conflictId, load, onChanged, onClose],
  );

  return (
    <DoctorModal
      open={conflictId !== null}
      onClose={onClose}
      title="Конфликт учётных записей"
      description="Проверьте, один ли это клиент, прежде чем принимать решение."
      size="lg"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null || loading}
            onClick={() => void act('refuse')}
          >
            {busy === 'refuse' ? 'Передаём…' : 'Отказать и передать в поддержку'}
          </Button>
          <Button
            type="button"
            disabled={busy !== null || loading || conflict?.doctorApproved === true}
            onClick={() => void act('merge')}
          >
            {busy === 'merge' ? 'Объединяем…' : 'Слить в этой организации'}
          </Button>
        </>
      }
    >
      {loading ? <p className={doctorMetaTextClass}>Загружаем сведения о конфликте…</p> : null}
      {!loading && conflict ? <ConflictDetails conflict={conflict} /> : null}
      {!loading && !conflict ? (
        <p className={doctorMetaTextClass}>Конфликт больше недоступен.</p>
      ) : null}
    </DoctorModal>
  );
}

export function DoctorMedicalMergeConflictProvider({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [summary, setSummary] = useState<MedicalConflictSummary>({
    conflictIds: [],
    clientIds: [],
    conflicts: [],
  });
  const [selectedConflictId, setSelectedConflictId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setSummary({ conflictIds: [], clientIds: [], conflicts: [] });
      return;
    }
    try {
      const response = await fetch('/api/doctor/account-merge-conflicts', {
        credentials: 'include',
        cache: 'no-store',
      });
      const next = parseSummary(await response.json().catch(() => null));
      if (response.ok && next) setSummary(next);
    } catch {
      // The indicators are supplemental; the clinical workspace remains usable while a refresh fails.
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const initialRefreshId = window.setTimeout(() => void refresh(), 0);
    const intervalId = window.setInterval(() => void refresh(), 20_000);
    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', refreshOnFocus);
    window.addEventListener('focus', refreshOnFocus);
    return () => {
      window.clearTimeout(initialRefreshId);
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshOnFocus);
      window.removeEventListener('focus', refreshOnFocus);
    };
  }, [enabled, refresh]);

  useEffect(() => {
    const requestedConflictId = searchParams.get('medicalConflict');
    if (!requestedConflictId || !summary.conflictIds.includes(requestedConflictId)) return;
    const openId = window.setTimeout(() => {
      setSelectedConflictId(requestedConflictId);
      router.replace(pathname, { scroll: false });
    }, 0);
    return () => window.clearTimeout(openId);
  }, [pathname, router, searchParams, summary.conflictIds]);

  const conflictIdByClientId = useMemo(() => {
    const map = new Map<string, string>();
    for (const conflict of summary.conflicts) {
      for (const clientId of conflict.clientIds) {
        if (!map.has(clientId)) map.set(clientId, conflict.id);
      }
    }
    return map;
  }, [summary.conflicts]);

  const contextValue = useMemo<DoctorMedicalMergeConflictContextValue>(
    () => ({
      count: summary.conflictIds.length,
      hasConflictForClient: (userId) => conflictIdByClientId.has(userId),
      conflictIdForClient: (userId) => conflictIdByClientId.get(userId) ?? null,
      openConflict: (conflictId) => setSelectedConflictId(conflictId),
      refresh,
    }),
    [conflictIdByClientId, refresh, summary.conflictIds.length],
  );

  return (
    <DoctorMedicalMergeConflictContext.Provider value={contextValue}>
      {children}
      <DoctorMedicalMergeConflictModal
        conflictId={selectedConflictId}
        onClose={() => setSelectedConflictId(null)}
        onChanged={refresh}
      />
    </DoctorMedicalMergeConflictContext.Provider>
  );
}

export function useDoctorMedicalMergeConflicts(): DoctorMedicalMergeConflictContextValue {
  const value = useContext(DoctorMedicalMergeConflictContext);
  if (!value) {
    throw new Error(
      'useDoctorMedicalMergeConflicts must be used within DoctorMedicalMergeConflictProvider',
    );
  }
  return value;
}
