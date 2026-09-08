'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import {
  doctorClientOverviewPrimaryCardClass,
  doctorClientPanelStackClass,
  doctorClientSectionTitleClass,
} from './doctorClientCardChrome';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';

type Note = { id: string; noteDate: string; text: string; revision?: number };
type Today = { iana: string; date: string };
type Props = { userId: string; embedded?: boolean };

function formatDate(noteDate: string) {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' }).format(
    new Date(`${noteDate}T12:00:00Z`),
  );
}

export function DoctorNotesPanel({ userId, embedded = false }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const notesRef = useRef<Note[]>([]);
  const [today, setToday] = useState<Today | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [savingDates, setSavingDates] = useState<Set<string>>(() => new Set());
  const [errorDates, setErrorDates] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const versionsRef = useRef(new Map<string, number>());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const savingRef = useRef(new Set<string>());

  const replaceNotes = useCallback((next: Note[]) => {
    notesRef.current = next;
    setNotes(next);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/notes`);
      const data = (await res.json()) as { ok?: boolean; notes?: Note[]; today?: Today };
      if (!res.ok || !data.ok || !data.today) return;
      replaceNotes(data.notes ?? []);
      setToday(data.today);
      setExpanded(new Set([data.today.date]));
    } finally {
      setLoading(false);
    }
  }, [replaceNotes, userId]);

  useEffect(() => {
    const timers = timersRef.current;
    void load();
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, [load]);

  const saveDate = useCallback(
    async (noteDate: string) => {
      if (savingRef.current.has(noteDate)) return;
      const note = notesRef.current.find((item) => item.noteDate === noteDate);
      if (!note) return;
      const version = versionsRef.current.get(noteDate) ?? 0;
      savingRef.current.add(noteDate);
      setSavingDates((current) => new Set(current).add(noteDate));
      setErrorDates((current) => {
        const next = new Set(current);
        next.delete(noteDate);
        return next;
      });
      try {
        const res = await fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ noteDate, text: note.text, expectedRevision: note.revision }),
        });
        const data = (await res.json()) as { ok?: boolean; note?: Note; error?: string };
        if (data.note && (data.ok || data.error === 'revision_conflict')) {
          replaceNotes(
            notesRef.current.map((item) =>
              item.noteDate === noteDate ? { ...item, revision: data.note?.revision } : item,
            ),
          );
          if (data.error === 'revision_conflict') versionsRef.current.set(noteDate, version + 1);
        } else {
          throw new Error('save_failed');
        }
      } catch {
        setErrorDates((current) => new Set(current).add(noteDate));
        timersRef.current.set(
          noteDate,
          setTimeout(() => void saveDate(noteDate), 1500),
        );
      } finally {
        savingRef.current.delete(noteDate);
        setSavingDates((current) => {
          const next = new Set(current);
          next.delete(noteDate);
          return next;
        });
        if ((versionsRef.current.get(noteDate) ?? 0) > version) {
          timersRef.current.set(
            noteDate,
            setTimeout(() => void saveDate(noteDate), 0),
          );
        }
      }
    },
    [replaceNotes, userId],
  );

  const changeText = useCallback(
    (noteDate: string, text: string) => {
      const existing = notesRef.current.find((item) => item.noteDate === noteDate);
      const next = existing
        ? notesRef.current.map((item) => (item.noteDate === noteDate ? { ...item, text } : item))
        : [{ id: `new-${noteDate}`, noteDate, text }, ...notesRef.current];
      replaceNotes(next);
      versionsRef.current.set(noteDate, (versionsRef.current.get(noteDate) ?? 0) + 1);
      const previousTimer = timersRef.current.get(noteDate);
      if (previousTimer) clearTimeout(previousTimer);
      timersRef.current.set(
        noteDate,
        setTimeout(() => void saveDate(noteDate), 500),
      );
    },
    [replaceNotes, saveDate],
  );

  const visibleNotes = today
    ? [...notes].sort((a, b) => b.noteDate.localeCompare(a.noteDate))
    : notes;
  const renderedNotes =
    today && !visibleNotes.some((note) => note.noteDate === today.date)
      ? [{ id: `new-${today.date}`, noteDate: today.date, text: '' }, ...visibleNotes]
      : visibleNotes;
  const body = (
    <>
      {loading ? <DoctorPanelLoading className="py-6" /> : null}
      <ul id="doctor-notes-list" className="m-0 list-none space-y-3 p-0">
        {renderedNotes.map((note) => {
          const isToday = note.noteDate === today?.date;
          const isExpanded = isToday || expanded.has(note.noteDate);
          return (
            <li key={note.noteDate} id={`doctor-note-${note.noteDate}`} className="text-sm">
              <button
                type="button"
                className="mb-1 text-left text-xs text-muted-foreground"
                onClick={() => setExpanded((current) => new Set(current).add(note.noteDate))}
                aria-expanded={isExpanded}
              >
                {formatDate(note.noteDate)}
              </button>
              {isExpanded ? (
                <Textarea
                  id={`doctor-note-text-${note.noteDate}`}
                  value={note.text}
                  onChange={(event) => changeText(note.noteDate, event.target.value)}
                  rows={isToday ? 3 : 2}
                  className="min-h-[56px] border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                  placeholder={isToday ? 'Заметка…' : undefined}
                  maxLength={8000}
                />
              ) : (
                <button
                  type="button"
                  className="line-clamp-3 block w-full whitespace-pre-wrap text-left"
                  onClick={() => setExpanded((current) => new Set(current).add(note.noteDate))}
                >
                  {note.text}
                </button>
              )}
              {savingDates.has(note.noteDate) ? (
                <p className="mt-1 text-xs text-muted-foreground">Сохранение…</p>
              ) : null}
              {errorDates.has(note.noteDate) ? (
                <p className="mt-1 text-xs text-destructive">Сохранение будет повторено</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );

  if (embedded)
    return (
      <div id="doctor-client-notes-section" className={doctorClientPanelStackClass}>
        {body}
      </div>
    );
  return (
    <section
      id="doctor-client-notes-section"
      className={doctorClientOverviewPrimaryCardClass}
      aria-labelledby="doctor-notes-heading"
    >
      <h2 id="doctor-notes-heading" className={doctorClientSectionTitleClass}>
        Заметки врача
      </h2>
      {body}
    </section>
  );
}
