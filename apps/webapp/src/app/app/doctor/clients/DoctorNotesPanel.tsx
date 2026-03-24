"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Note = {
  id: string;
  text: string;
  createdAt: string;
};

type Props = {
  userId: string;
};

export function DoctorNotesPanel({ userId }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/notes`);
      const data = (await res.json()) as { ok?: boolean; notes?: Note[] };
      if (!res.ok || !data.ok) {
        setError("Не удалось загрузить заметки");
        return;
      }
      setNotes(data.notes ?? []);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || !data.ok) {
        setError("Не удалось сохранить");
        return;
      }
      setText("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="doctor-client-notes-section" className="panel stack" aria-labelledby="doctor-notes-heading">
      <h2 id="doctor-notes-heading">Заметки врача</h2>
      {loading ? <p className="text-muted-foreground">Загрузка…</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <ul id="doctor-notes-list" className="list space-y-2" style={{ listStyle: "none", padding: 0 }}>
        {notes.map((n) => (
          <li key={n.id} id={`doctor-note-${n.id}`} className="rounded-md border border-border p-2 text-sm">
            <span className="text-muted-foreground text-xs">
              {new Date(n.createdAt).toLocaleString("ru-RU")}
            </span>
            <p className="mt-1 whitespace-pre-wrap">{n.text}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={onSubmit} className="stack gap-2">
        <label htmlFor="doctor-note-text" className="sr-only">
          Новая заметка
        </label>
        <textarea
          id="doctor-note-text"
          value={text}
          onChange={(ev) => setText(ev.target.value)}
          rows={3}
          className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Текст заметки…"
          maxLength={8000}
        />
        <Button type="submit" disabled={saving || !text.trim()}>
          {saving ? "Сохранение…" : "Добавить заметку"}
        </Button>
      </form>
    </section>
  );
}
