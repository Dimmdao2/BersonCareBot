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
  const [errorDates, setErrorDates] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const versionsRef = useRef(new Map<string, number>());
  const savedVersionsRef = useRef(new Map<string, number>());
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
    } finally {
      setLoading(false);
    }
  }, [replaceNotes, userId]);

  const saveDate = useCallback(
    async (noteDate: string) => {
      if (savingRef.current.has(noteDate)) return;
      const note = notesRef.current.find((item) => item.noteDate === noteDate);
      if (!note) return;
      const version = versionsRef.current.get(noteDate) ?? 0;
      savingRef.current.add(noteDate);
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
          if (data.error === 'revision_conflict') {
            versionsRef.current.set(noteDate, version + 1);
          } else {
            savedVersionsRef.current.set(noteDate, version);
          }
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

  useEffect(() => {
    const timers = timersRef.current;
    const versions = versionsRef.current;
    const savedVersions = savedVersionsRef.current;
    void load();
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      for (const [noteDate, version] of versions) {
        if (version > (savedVersions.get(noteDate) ?? 0)) {
          void saveDate(noteDate);
        }
      }
    };
  }, [load, saveDate]);

  const visibleNotes = today
    ? [...notes].sort((a, b) => a.noteDate.localeCompare(b.noteDate))
    : notes;
  const renderedNotes =
    today && !visibleNotes.some((note) => note.noteDate === today.date)
      ? [...visibleNotes, { id: `new-${today.date}`, noteDate: today.date, text: '' }]
      : visibleNotes;
  const body = (
    <>
      {loading ? <DoctorPanelLoading className="py-6" /> : null}
      <ul
        id="doctor-notes-list"
        className="m-0 list-none space-y-5 px-[var(--doctor-list-inline-padding,18px)] py-4"
      >
        {renderedNotes.map((note) => {
          const isToday = note.noteDate === today?.date;
          return (
            <li key={note.noteDate} id={`doctor-note-${note.noteDate}`} className="space-y-1.5">
              <p className="text-base font-medium text-foreground">{formatDate(note.noteDate)}</p>
              <Textarea
                id={`doctor-note-text-${note.noteDate}`}
                value={note.text}
                onChange={(event) => changeText(note.noteDate, event.target.value)}
                rows={isToday ? 3 : 2}
                className="min-h-[64px] resize-none overflow-hidden border-0 bg-transparent px-0 text-base leading-6 shadow-none [field-sizing:content] focus-visible:ring-0"
                placeholder={isToday ? 'Заметка…' : undefined}
                maxLength={8000}
              />
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
