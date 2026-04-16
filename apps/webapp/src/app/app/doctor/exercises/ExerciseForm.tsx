"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ReferenceSelect } from "@/shared/ui/ReferenceSelect";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Exercise, ExerciseLoadType } from "@/modules/lfk-exercises/types";
import { cn } from "@/lib/utils";
import { API_MEDIA_URL_RE } from "@/shared/lib/mediaUrlPolicy";
import { MediaLibraryPickerDialog } from "@/app/app/doctor/content/MediaLibraryPickerDialog";
import { archiveDoctorExercise, saveDoctorExercise } from "./actions";
import type { SaveDoctorExerciseState } from "./actionsShared";
import { exerciseMediaTypeFromPick } from "./exerciseMediaFromLibrary";

const LOAD_OPTIONS: { value: ExerciseLoadType; label: string }[] = [
  { value: "strength", label: "Силовая" },
  { value: "stretch", label: "Растяжка" },
  { value: "balance", label: "Баланс" },
  { value: "cardio", label: "Кардио" },
  { value: "other", label: "Другое" },
];

type ExerciseFormProps = {
  exercise?: Exercise | null;
  saveAction?: (_prev: SaveDoctorExerciseState | null, formData: FormData) => Promise<SaveDoctorExerciseState>;
  archiveAction?: (formData: FormData) => Promise<void>;
  backHref?: string;
};

export function ExerciseForm({
  exercise,
  saveAction = saveDoctorExercise,
  archiveAction = archiveDoctorExercise,
  backHref = "/app/doctor/exercises",
}: ExerciseFormProps) {
  const [saveState, formAction, savePending] = useActionState(saveAction, null as SaveDoctorExerciseState | null);
  const [regionRefId, setRegionRefId] = useState<string | null>(exercise?.regionRefId ?? null);
  const [regionLabel, setRegionLabel] = useState("");
  const [loadType, setLoadType] = useState<ExerciseLoadType | "">(exercise?.loadType ?? "");
  const [difficulty, setDifficulty] = useState<number>(exercise?.difficulty1_10 ?? 5);

  const initialMedia = exercise?.media[0];
  const [mediaUrl, setMediaUrl] = useState(initialMedia?.mediaUrl ?? "");
  const [mediaType, setMediaType] = useState<"" | "image" | "video" | "gif">(initialMedia?.mediaType ?? "");

  const tagsStr = exercise?.tags?.join(", ") ?? "";

  const showLegacyMediaWarning = Boolean(mediaUrl.trim() && !API_MEDIA_URL_RE.test(mediaUrl.trim()));

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        {saveState?.error ? (
          <p role="alert" className="text-sm text-destructive">
            {saveState.error}
          </p>
        ) : null}
        {exercise ? <input type="hidden" name="id" value={exercise.id} /> : null}
        <input type="hidden" name="regionRefId" value={regionRefId ?? ""} />
        <input type="hidden" name="mediaUrl" value={mediaUrl} />
        <input type="hidden" name="mediaType" value={mediaType} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="ex-title">Название</Label>
          <Input
            id="ex-title"
            name="title"
            required
            defaultValue={exercise?.title ?? ""}
            placeholder="Например, разгибание колена сидя"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="ex-desc">Описание</Label>
          <Textarea
            id="ex-desc"
            name="description"
            className="min-h-[100px]"
            defaultValue={exercise?.description ?? ""}
            placeholder="Краткая техника выполнения"
          />
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
          <p className="text-sm font-medium">Медиа (опционально)</p>
          <MediaLibraryPickerDialog
            kind="image_or_video"
            value={mediaUrl}
            selectedPreviewKind={mediaType || undefined}
            pickerTitle="Изображение, GIF или видео"
            onChange={(url, meta) => {
              setMediaUrl(url);
              if (url && meta) setMediaType(exerciseMediaTypeFromPick(meta));
              else setMediaType("");
            }}
          />
          {showLegacyMediaWarning ? (
            <p className="text-xs text-amber-800">
              Сохранён внешний URL: для новых медиа выберите файл из библиотеки (/api/media/…).
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Область тела</span>
          <ReferenceSelect
            categoryCode="body_region"
            value={regionRefId}
            onChange={(refId, label) => {
              setRegionRefId(refId);
              setRegionLabel(label);
            }}
            placeholder="Выберите область"
          />
          {regionLabel ? (
            <p className="text-xs text-muted-foreground">Выбрано: {regionLabel}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label>Тип нагрузки</Label>
          <input type="hidden" name="loadType" value={loadType} />
          <Select
            value={loadType || undefined}
            onValueChange={(v) => {
              if (v) setLoadType(v as ExerciseLoadType);
            }}
          >
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Не выбран" />
            </SelectTrigger>
            <SelectContent>
              {LOAD_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="ex-difficulty">Сложность (1–10)</Label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="ex-difficulty"
              name="difficulty1_10"
              type="range"
              min={1}
              max={10}
              value={difficulty}
              onChange={(e) => setDifficulty(Number(e.target.value))}
              className="w-full max-w-xs accent-primary"
            />
            <span className="text-sm tabular-nums text-muted-foreground">{difficulty}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="ex-contra">Противопоказания</Label>
          <Textarea
            id="ex-contra"
            name="contraindications"
            className="min-h-[72px]"
            defaultValue={exercise?.contraindications ?? ""}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="ex-tags">Теги (через запятую)</Label>
          <Input id="ex-tags" name="tags" defaultValue={tagsStr} placeholder="колено, дома" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={savePending}>
            {savePending ? "Сохранение…" : exercise ? "Сохранить" : "Создать упражнение"}
          </Button>
          <Link href={backHref} className={cn(buttonVariants({ variant: "outline" }))}>
            К списку
          </Link>
        </div>
      </form>

      {exercise ? (
        <form action={archiveAction} className="border-t border-border/60 pt-4">
          <input type="hidden" name="id" value={exercise.id} />
          <Button type="submit" variant="destructive">
            Архивировать
          </Button>
        </form>
      ) : null}
    </div>
  );
}
