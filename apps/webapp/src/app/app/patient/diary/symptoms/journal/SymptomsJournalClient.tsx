'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, useMemo } from 'react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { MoreHorizontal } from 'lucide-react';
import { Button, buttonVariants } from '@/shared/ui/patient/primitives/button';
import { cn } from '@/lib/utils';
import { PatientModal, PatientModalFooter } from '@/shared/ui/patient/PatientModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/patient/primitives/dropdown-menu';
import { Input } from '@/shared/ui/patient/primitives/input';
import { Textarea } from '@/shared/ui/patient/primitives/textarea';
import { PatientField } from '@/shared/ui/patient/PatientField';
import { patientFieldLabelClassName } from '@/shared/ui/patient/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/patient/primitives/select';
import { routePaths } from '@/app-layer/routes/paths';
import type { StatsPeriod } from '@/modules/diaries/stats/periodWindow';
import type { SymptomEntry } from '@/modules/diaries/types';
import { JournalMonthNav } from '../../JournalMonthNav';
import { deleteSymptomJournalEntry, updateSymptomJournalEntry } from '../actions';
import { isSymptomJournalEntryEditable } from '../symptomJournalEditWindow';
import { patientListItemClass, patientMutedTextClass } from '@/shared/ui/patient/patientVisual';
import { PatientConfirmModal } from '@/shared/ui/patient/PatientConfirmModal';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const SYMPTOM_JOURNAL_EDIT_FORM_ID = 'symptom-journal-edit-form';

export function SymptomsJournalClient(props: {
  entries: SymptomEntry[];
  trackings: { id: string; symptomTitle: string }[];
  activeTrackingId: string;
  monthYm: string;
  period: StatsPeriod;
  offset: number;
}) {
  const { entries, trackings, activeTrackingId, monthYm, period, offset } = props;
  const router = useRouter();
  const [editEntry, setEditEntry] = useState<SymptomEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<SymptomEntry | null>(null);
  const [pending, startTransition] = useTransition();

  const symptomJournalTrackingSelectItems = useMemo(
    () => Object.fromEntries(trackings.map((t) => [t.id, t.symptomTitle])),
    [trackings],
  );

  const trackingHref = (id: string) => {
    const p = new URLSearchParams();
    p.set('trackingId', id);
    p.set('month', monthYm);
    p.set('period', period);
    p.set('offset', String(offset));
    return `${routePaths.diarySymptomsJournal}?${p.toString()}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`${routePaths.diary}?tab=symptoms`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'inline-flex text-xs')}
        >
          ← К статистике
        </Link>
      </div>

      {trackings.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={patientMutedTextClass}>Симптом</span>
          <Select
            value={activeTrackingId}
            onValueChange={(id) => {
              if (id != null) router.push(trackingHref(id));
            }}
            items={symptomJournalTrackingSelectItems}
          >
            <SelectTrigger variant="journal">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {trackings.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.symptomTitle}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className={patientFieldLabelClassName}>Период (календарный месяц)</span>
        <JournalMonthNav
          basePath={routePaths.diarySymptomsJournal}
          monthYm={monthYm}
          period={period}
          offset={offset}
          trackingId={activeTrackingId}
        />
      </div>

      {entries.length === 0 ? (
        <p className={patientMutedTextClass}>За этот месяц записей нет.</p>
      ) : (
        <ul className="m-0 list-none space-y-3 p-0">
          {entries.map((e) => {
            const canEdit = isSymptomJournalEntryEditable(e.recordedAt);
            return (
              <li
                key={e.id}
                className={cn(
                  patientListItemClass,
                  'flex flex-wrap items-start justify-between gap-2',
                )}
              >
                <div className="min-w-0 flex-1">
                  <strong>{e.symptomTitle ?? '—'}</strong> — {e.value0_10}/10 ·{' '}
                  {e.entryType === 'daily' ? 'за день' : 'в моменте'}
                  <div className={patientMutedTextClass}>
                    {new Date(e.recordedAt).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                  {e.notes ? <p className="mt-1 text-sm">{e.notes}</p> : null}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-muted"
                    aria-label="Действия"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canEdit ? (
                      <DropdownMenuItem onClick={() => setEditEntry(e)}>
                        Редактировать
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        disabled
                        title="Редактирование доступно в течение 24 часов с момента времени записи"
                      >
                        Редактировать
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleteEntry(e)}>
                      Удалить
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}

      <PatientModal
        open={editEntry !== null}
        onClose={() => setEditEntry(null)}
        title="Редактировать запись"
        size="md"
      >
        {editEntry ? (
          !isSymptomJournalEntryEditable(editEntry.recordedAt) ? (
            <>
              <p className={patientMutedTextClass}>
                Редактирование доступно только в течение 24 часов с момента времени записи.
              </p>
              <PatientModalFooter>
                <Button type="button" onClick={() => setEditEntry(null)}>
                  Закрыть
                </Button>
              </PatientModalFooter>
            </>
          ) : (
            <form
              id={SYMPTOM_JOURNAL_EDIT_FORM_ID}
              className="flex flex-col gap-3"
              onSubmit={(ev) => {
                ev.preventDefault();
                const form = ev.currentTarget;
                const fd = new FormData(form);
                const local = fd.get('recordedAtLocal');
                if (typeof local !== 'string' || !local) {
                  toast.error('Укажите дату и время');
                  return;
                }
                fd.set('recordedAt', new Date(local).toISOString());
                fd.set('entryId', editEntry.id);
                startTransition(async () => {
                  const res = await updateSymptomJournalEntry(fd);
                  if (res.ok) {
                    toast.success('Сохранено');
                    setEditEntry(null);
                    router.refresh();
                  } else {
                    toast.error(res.message ?? 'Не удалось сохранить');
                  }
                });
              }}
            >
              <PatientField label="Интенсивность (0–10)" htmlFor="symptom-journal-value">
                <Input
                  id="symptom-journal-value"
                  variant="journal"
                  type="number"
                  name="value"
                  min={0}
                  max={10}
                  required
                  defaultValue={editEntry.value0_10}
                />
              </PatientField>
              <PatientField label="Дата и время" htmlFor="symptom-journal-recorded-at">
                <Input
                  id="symptom-journal-recorded-at"
                  variant="journal"
                  type="datetime-local"
                  name="recordedAtLocal"
                  required
                  defaultValue={toDatetimeLocalValue(editEntry.recordedAt)}
                />
              </PatientField>
              <PatientField label="Заметки" htmlFor="symptom-journal-notes">
                <Textarea
                  id="symptom-journal-notes"
                  name="notes"
                  variant="journal"
                  rows={3}
                  defaultValue={editEntry.notes ?? ''}
                />
              </PatientField>
              <PatientModalFooter>
                <Button type="button" variant="outline" onClick={() => setEditEntry(null)}>
                  Отмена
                </Button>
                {/* Футер живёт вне DOM-дерева формы (портал), поэтому связь — атрибутом `form`. */}
                <Button
                  type="submit"
                  variant="patient-primary"
                  form={SYMPTOM_JOURNAL_EDIT_FORM_ID}
                  disabled={pending}
                >
                  Сохранить
                </Button>
              </PatientModalFooter>
            </form>
          )
        ) : null}
      </PatientModal>
      <PatientConfirmModal
        open={deleteEntry !== null}
        onClose={() => setDeleteEntry(null)}
        onConfirm={() => {
          if (!deleteEntry) return;
          const entryId = deleteEntry.id;
          startTransition(async () => {
            const fd = new FormData();
            fd.set('entryId', entryId);
            const res = await deleteSymptomJournalEntry(fd);
            if (res.ok) {
              toast.success('Запись удалена');
              setDeleteEntry(null);
              router.refresh();
            } else {
              toast.error(res.message ?? 'Не удалось удалить');
            }
          });
        }}
        title="Удалить запись?"
        confirmLabel="Удалить"
        pending={pending}
        destructive
      >
        Это действие нельзя отменить.
      </PatientConfirmModal>
    </div>
  );
}
