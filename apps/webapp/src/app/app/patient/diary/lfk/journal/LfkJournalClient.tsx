'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, useMemo } from 'react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { MoreHorizontal } from 'lucide-react';
import { Button, buttonVariants } from '@/shared/ui/patient/primitives/button';
import { Badge } from '@/shared/ui/patient/primitives/badge';
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
import type { LfkSession } from '@/modules/diaries/types';
import { JournalMonthNav } from '../../JournalMonthNav';
import { deleteLfkJournalSession, updateLfkJournalSession } from '../actions';
import { patientListItemClass, patientMutedTextClass } from '@/shared/ui/patient/patientVisual';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const LFK_JOURNAL_EDIT_FORM_ID = 'lfk-journal-edit-form';

export function LfkJournalClient(props: {
  sessions: LfkSession[];
  complexes: { id: string; title: string }[];
  activeComplexId: string;
  monthYm: string;
  period: StatsPeriod;
  offset: number;
}) {
  const { sessions, complexes, activeComplexId, monthYm, period, offset } = props;
  const router = useRouter();
  const [editSession, setEditSession] = useState<LfkSession | null>(null);
  const [pending, startTransition] = useTransition();

  const lfkJournalComplexSelectItems = useMemo(
    () => Object.fromEntries(complexes.map((c) => [c.id, c.title])),
    [complexes],
  );

  const complexHref = (id: string) => {
    const p = new URLSearchParams();
    p.set('complexId', id);
    p.set('month', monthYm);
    p.set('period', period);
    p.set('offset', String(offset));
    return `${routePaths.diaryLfkJournal}?${p.toString()}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`${routePaths.diary}?tab=lfk`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'inline-flex text-xs')}
        >
          ← К статистике
        </Link>
      </div>

      {complexes.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={patientMutedTextClass}>Комплекс</span>
          <Select
            value={activeComplexId}
            onValueChange={(id) => {
              if (id != null) router.push(complexHref(id));
            }}
            items={lfkJournalComplexSelectItems}
          >
            <SelectTrigger variant="journal">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {complexes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className={patientFieldLabelClassName}>
          Период (календарный месяц)
        </span>
        <JournalMonthNav
          basePath={routePaths.diaryLfkJournal}
          monthYm={monthYm}
          period={period}
          offset={offset}
          complexId={activeComplexId}
        />
      </div>

      {sessions.length === 0 ? (
        <p className={patientMutedTextClass}>За этот месяц занятий нет.</p>
      ) : (
        <ul className="m-0 list-none space-y-3 p-0">
          {sessions.map((s) => (
            <li
              key={s.id}
              className={cn(
                patientListItemClass,
                'flex flex-wrap items-start justify-between gap-2',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{s.complexTitle ?? 'ЛФК'}</strong>
                  <Badge variant="secondary" className="font-normal">
                    Завершен
                  </Badge>
                </div>
                <div className={patientMutedTextClass}>
                  {new Date(s.completedAt).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-sm">
                  {s.durationMinutes != null ? <span>{s.durationMinutes} мин</span> : null}
                  {s.difficulty0_10 != null ? <span>Сложн. {s.difficulty0_10}/10</span> : null}
                  {s.pain0_10 != null ? <span>Боль {s.pain0_10}/10</span> : null}
                </div>
                {s.comment ? <p className="mt-1 text-sm">{s.comment}</p> : null}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-muted"
                  aria-label="Действия"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditSession(s)}>
                    Редактировать
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      if (!window.confirm('Удалить эту запись?')) return;
                      startTransition(async () => {
                        const fd = new FormData();
                        fd.set('sessionId', s.id);
                        const res = await deleteLfkJournalSession(fd);
                        if (res.ok) {
                          toast.success('Запись удалена');
                          router.refresh();
                        } else {
                          toast.error(res.message ?? 'Не удалось удалить');
                        }
                      });
                    }}
                  >
                    Удалить
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <PatientModal
        open={editSession !== null}
        onClose={() => setEditSession(null)}
        title="Редактировать занятие"
        size="md"
      >
        {editSession ? (
          <form
            id={LFK_JOURNAL_EDIT_FORM_ID}
            className="flex flex-col gap-3"
            onSubmit={(ev) => {
              ev.preventDefault();
              const form = ev.currentTarget;
              const fd = new FormData(form);
              const local = fd.get('completedAtLocal');
              if (typeof local !== 'string' || !local) {
                toast.error('Укажите дату и время');
                return;
              }
              fd.set('completedAt', new Date(local).toISOString());
              fd.set('sessionId', editSession.id);
              startTransition(async () => {
                const res = await updateLfkJournalSession(fd);
                if (res.ok) {
                  toast.success('Сохранено');
                  setEditSession(null);
                  router.refresh();
                } else {
                  toast.error(res.message ?? 'Не удалось сохранить');
                }
              });
            }}
          >
            <PatientField label="Дата и время" htmlFor="lfk-journal-completed-at">
              <Input
                id="lfk-journal-completed-at"
                variant="journal"
                type="datetime-local"
                name="completedAtLocal"
                required
                defaultValue={toDatetimeLocalValue(editSession.completedAt)}
              />
            </PatientField>
            <PatientField label="Длительность (мин)" htmlFor="lfk-journal-duration">
              <Input
                id="lfk-journal-duration"
                variant="journal"
                type="number"
                name="durationMinutes"
                min={1}
                max={600}
                placeholder="—"
                defaultValue={editSession.durationMinutes ?? ''}
              />
            </PatientField>
            <PatientField label="Сложность 0–10" htmlFor="lfk-journal-difficulty">
              <Input
                id="lfk-journal-difficulty"
                variant="journal"
                type="number"
                name="difficulty0_10"
                min={0}
                max={10}
                placeholder="—"
                defaultValue={editSession.difficulty0_10 ?? ''}
              />
            </PatientField>
            <PatientField label="Боль 0–10" htmlFor="lfk-journal-pain">
              <Input
                id="lfk-journal-pain"
                variant="journal"
                type="number"
                name="pain0_10"
                min={0}
                max={10}
                placeholder="—"
                defaultValue={editSession.pain0_10 ?? ''}
              />
            </PatientField>
            <PatientField label="Комментарий" htmlFor="lfk-journal-comment">
              <Textarea
                id="lfk-journal-comment"
                name="comment"
                variant="journal"
                className="min-h-[4.5rem]"
                rows={3}
                maxLength={200}
                defaultValue={editSession.comment ?? ''}
              />
            </PatientField>
            <PatientModalFooter>
              <Button type="button" variant="outline" onClick={() => setEditSession(null)}>
                Отмена
              </Button>
              {/* Футер живёт вне DOM-дерева формы (портал), поэтому связь — атрибутом `form`. */}
              <Button type="submit" form={LFK_JOURNAL_EDIT_FORM_ID} disabled={pending}>
                Сохранить
              </Button>
            </PatientModalFooter>
          </form>
        ) : null}
      </PatientModal>
    </div>
  );
}
