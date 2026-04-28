"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MediaLibraryPickerDialog } from "@/app/app/doctor/content/MediaLibraryPickerDialog";
import { savePatientHomeMoodIconsAction } from "./patientHomeDoctorSettingsActions";
import type { PatientHomeMoodIconOption } from "@/modules/patient-home/patientHomeMoodIcons";

type Row = { score: 1 | 2 | 3 | 4 | 5; label: string; imageUrl: string | null };

function toRows(options: readonly PatientHomeMoodIconOption[]): Row[] {
  return options.map((o) => ({
    score: o.score,
    label: o.label,
    imageUrl: o.imageUrl,
  }));
}

export function PatientHomeMoodIconsPanel(props: { initialOptions: readonly PatientHomeMoodIconOption[] }) {
  const [rows, setRows] = useState<Row[]>(() => toRows(props.initialOptions));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setImage(score: 1 | 2 | 3 | 4 | 5, url: string) {
    setRows((prev) => prev.map((r) => (r.score === score ? { ...r, imageUrl: url.trim() || null } : r)));
  }

  function setLabel(score: 1 | 2 | 3 | 4 | 5, label: string) {
    setRows((prev) => prev.map((r) => (r.score === score ? { ...r, label } : r)));
  }

  async function onSave() {
    setMessage(null);
    setError(null);
    setPending(true);
    try {
      const res = await savePatientHomeMoodIconsAction(
        rows.map((r) => ({ score: r.score, label: r.label.trim(), imageUrl: r.imageUrl })),
      );
      if (!res.ok) {
        setError("Не удалось сохранить.");
        return;
      }
      setMessage("Сохранено");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="rounded-2xl border border-border bg-card p-4 shadow-sm"
      aria-labelledby="patient-home-mood-icons-heading"
    >
      <h2 id="patient-home-mood-icons-heading" className="text-base font-semibold">
        Иконки самочувствия на главной
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Для каждой оценки 1–5 выберите изображение в медиатеке. Текст подписи можно изменить.
      </p>
      <div className="mt-4 space-y-4">
        {rows.map((r) => (
          <div
            key={r.score}
            className="flex flex-col gap-2 rounded-lg border border-border/70 bg-background/50 p-3 sm:flex-row sm:items-end sm:gap-4"
          >
            <div className="text-sm font-medium text-muted-foreground sm:w-20">Оценка {r.score}</div>
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Подпись</span>
              <input
                className="h-9 w-full min-w-0 rounded-md border border-border bg-background px-3 text-sm"
                value={r.label}
                onChange={(e) => setLabel(r.score, e.target.value)}
                aria-label={`Подпись для оценки ${r.score}`}
              />
            </label>
            <div className="flex min-w-0 flex-col gap-1 sm:flex-1">
              <span className="text-xs font-medium text-muted-foreground">Изображение</span>
              <MediaLibraryPickerDialog
                kind="image"
                value={r.imageUrl ?? ""}
                onChange={(url) => setImage(r.score, url)}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <Button type="button" onClick={() => void onSave()} disabled={pending}>
          {pending ? "Сохранение…" : "Сохранить"}
        </Button>
      </div>
      {error ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-2 text-sm text-green-700" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
