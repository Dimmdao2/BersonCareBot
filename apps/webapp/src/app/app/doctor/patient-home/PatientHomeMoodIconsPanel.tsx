"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MediaLibraryPickerDialog } from "@/app/app/doctor/content/MediaLibraryPickerDialog";
import { savePatientHomeMoodIconsAction } from "./patientHomeDoctorSettingsActions";
import type { PatientHomeMoodIconOption } from "@/modules/patient-home/patientHomeMoodIcons";

type Row = { score: 1 | 2 | 3 | 4 | 5; label: string; imageUrl: string | null };

const FALLBACK_LABEL_BY_SCORE: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Очень плохо",
  2: "Скорее плохо",
  3: "Нейтрально",
  4: "Хорошо",
  5: "Отлично",
};

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

  async function onSave() {
    setMessage(null);
    setError(null);
    setPending(true);
    try {
      const res = await savePatientHomeMoodIconsAction(
        rows.map((r) => ({
          score: r.score,
          label: r.label.trim() || FALLBACK_LABEL_BY_SCORE[r.score],
          imageUrl: r.imageUrl,
        })),
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
        Для каждой оценки 1–5 выберите изображение в медиатеке. Подписи на главной не показываются.
      </p>
      <div className="mt-4 grid grid-cols-5 gap-2 sm:gap-3">
        {rows.map((r) => (
          <div
            key={r.score}
            className="flex min-w-0 flex-col items-center gap-2 rounded-lg border border-border/70 bg-background/50 p-2 text-center sm:p-3"
          >
            <div className="flex size-14 items-center justify-center overflow-hidden rounded-full border border-border bg-muted/30 sm:size-16">
              {r.imageUrl ?
                // eslint-disable-next-line @next/next/no-img-element -- doctor preview for selected CMS media URL
                <img src={r.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
              : <span className="text-lg font-semibold text-muted-foreground">{r.score}</span>}
            </div>
            <div className="text-xs font-semibold text-foreground">{r.score}</div>
            <div className="flex justify-center">
              <MediaLibraryPickerDialog
                kind="image"
                value={r.imageUrl ?? ""}
                onChange={(url) => setImage(r.score, url)}
                pickerTitle={`Иконка самочувствия ${r.score}`}
                selectButtonLabel="Выбрать иконку"
                showPreview={false}
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
