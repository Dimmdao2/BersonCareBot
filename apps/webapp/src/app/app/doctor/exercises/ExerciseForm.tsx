"use client";

import type { CSSProperties } from "react";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReferenceSelect } from "@/shared/ui/ReferenceSelect";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { Exercise, ExerciseLoadType, ExerciseUsageSnapshot } from "@/modules/lfk-exercises/types";
import { MediaLibraryPickerDialog } from "@/app/app/doctor/content/MediaLibraryPickerDialog";
import { archiveDoctorExercise, fetchDoctorExerciseUsageSnapshot, saveDoctorExercise } from "./actions";
import type { ArchiveDoctorExerciseState, SaveDoctorExerciseState } from "./actionsShared";
import { exerciseMediaTypeFromPick, exerciseTitleFromPickMeta } from "./exerciseMediaFromLibrary";
import { exerciseUsageHasAnyReference, exerciseUsageSummaryLines } from "./exerciseUsageSummaryText";

const LOAD_OPTIONS: { value: ExerciseLoadType; label: string }[] = [
  { value: "strength", label: "Силовая" },
  { value: "stretch", label: "Растяжка" },
  { value: "balance", label: "Баланс" },
  { value: "cardio", label: "Кардио" },
  { value: "other", label: "Другое" },
];

/** Заливка дорожки слайдера: от почти прозрачного светло-синего к почти чёрному тёмно-синему (1→10). */
function exerciseDifficultyTrackFill(level: number): string {
  const t = Math.max(0, Math.min(1, (level - 1) / 9));
  const h = 215;
  const s = 42 + t * 25;
  const l = 94 - t * 81;
  const alpha = 0.18 + t * 0.82;
  return `hsl(${h} ${Math.round(s)}% ${Math.round(l)}% / ${alpha.toFixed(3)})`;
}

/** Стили дорожки: градиент с inline-цветом (браузеры часто отбрасывают при invalid syntax в CSS-файле). */
function exerciseDifficultyRangeSliderStyle(difficulty: number): CSSProperties {
  const level = Number.isFinite(difficulty) ? Math.max(1, Math.min(10, Math.round(difficulty))) : 5;
  const p = ((level - 1) / 9) * 100;
  const fill = exerciseDifficultyTrackFill(level);
  const unfilled = "color-mix(in srgb, var(--muted) 88%, var(--border))";
  return {
    "--ex-diff-fill": fill,
    "--ex-diff-progress": `${p}%`,
    background: `linear-gradient(to right, ${fill} 0%, ${fill} 100%) 0 0 / ${p}% 100% no-repeat, ${unfilled}`,
  } as CSSProperties;
}

export type ExerciseFormValues = {
  title: string;
  description: string;
  tags: string;
  contraindications: string;
  regionRefId: string | null;
  loadType: ExerciseLoadType | "";
  difficulty: number;
  mediaUrl: string;
  mediaType: "" | "image" | "video" | "gif";
};

export function exerciseToFormValues(exercise: Exercise | null | undefined): ExerciseFormValues {
  const initialMedia = exercise?.media[0];
  return {
    title: exercise?.title ?? "",
    description: exercise?.description ?? "",
    tags: exercise?.tags?.join(", ") ?? "",
    contraindications: exercise?.contraindications ?? "",
    regionRefId: exercise?.regionRefId ?? null,
    loadType: (exercise?.loadType ?? "") as ExerciseLoadType | "",
    difficulty: exercise?.difficulty1_10 ?? 5,
    mediaUrl: initialMedia?.mediaUrl ?? "",
    mediaType: (initialMedia?.mediaType ?? "") as ExerciseFormValues["mediaType"],
  };
}

type ExerciseFormProps = {
  exercise?: Exercise | null;
  saveAction?: (_prev: SaveDoctorExerciseState | null, formData: FormData) => Promise<SaveDoctorExerciseState>;
  archiveAction?: (
    _prev: ArchiveDoctorExerciseState | null,
    formData: FormData,
  ) => Promise<ArchiveDoctorExerciseState>;
  /** Current exercises list view — passed as hidden field for inline redirects after save/archive. */
  viewHint?: string;
  /**
   * Snapshot с сервера (например `?selected=` или RSC edit page). Если не передан — usage
   * подгружается через `fetchDoctorExerciseUsageSnapshot`.
   */
  externalUsageSnapshot?: ExerciseUsageSnapshot;
};

export function ExerciseForm({
  exercise,
  saveAction = saveDoctorExercise,
  archiveAction = archiveDoctorExercise,
  viewHint,
  externalUsageSnapshot,
}: ExerciseFormProps) {
  const recordKey = exercise?.id ?? "create";

  const [values, setValues] = useState<ExerciseFormValues>(() => exerciseToFormValues(exercise));
  const [regionLabel, setRegionLabel] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [usage, setUsage] = useState<ExerciseUsageSnapshot | null>(null);
  const [usageLoadError, setUsageLoadError] = useState<string | null>(null);
  const [usageBusy, setUsageBusy] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const archiveFormRef = useRef<HTMLFormElement>(null);
  const acknowledgeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValues(exerciseToFormValues(exercise));
    setRegionLabel("");
    setLocalError(null);
    setUsageLoadError(null);
    setWarnOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- полный reset только при смене редактируемой сущности
  }, [recordKey]);

  useEffect(() => {
    if (!exercise?.id) {
      setUsage(null);
      return;
    }
    if (externalUsageSnapshot !== undefined) {
      setUsage(externalUsageSnapshot);
      return;
    }
    let cancelled = false;
    setUsageBusy(true);
    void fetchDoctorExerciseUsageSnapshot(exercise.id)
      .then((u) => {
        if (!cancelled) setUsage(u);
      })
      .catch(() => {
        if (!cancelled) {
          setUsage(null);
          setUsageLoadError("Не удалось загрузить сводку использования");
        }
      })
      .finally(() => {
        if (!cancelled) setUsageBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [exercise?.id, externalUsageSnapshot]);

  const wrappedSaveAction = useCallback(
    async (prev: SaveDoctorExerciseState | null, formData: FormData) => {
      setLocalError(null);
      const r = await saveAction(prev, formData);
      if (!r.ok && r.error) setLocalError(r.error);
      return r;
    },
    [saveAction],
  );

  const [, formAction, savePending] = useActionState(wrappedSaveAction, null as SaveDoctorExerciseState | null);

  const [archiveState, archiveFormAction, archivePending] = useActionState(
    archiveAction,
    null as ArchiveDoctorExerciseState | null,
  );

  useEffect(() => {
    if (
      archiveState?.ok === false &&
      "code" in archiveState &&
      archiveState.code === "USAGE_CONFIRMATION_REQUIRED"
    ) {
      setWarnOpen(true);
    }
  }, [archiveState]);

  const displayError = localError;

  const usageLines = useMemo(() => {
    if (!usage) return [];
    if (!exerciseUsageHasAnyReference(usage)) return ["Пока не используется"];
    return exerciseUsageSummaryLines(usage);
  }, [usage]);

  const warnLines = useMemo(() => {
    if (
      archiveState?.ok === false &&
      "code" in archiveState &&
      archiveState.code === "USAGE_CONFIRMATION_REQUIRED"
    ) {
      const u = archiveState.usage;
      if (!exerciseUsageHasAnyReference(u)) return ["Упражнение помечено как используемое — проверьте связи перед архивацией."];
      return exerciseUsageSummaryLines(u);
    }
    return [];
  }, [archiveState]);

  const archiveError =
    archiveState?.ok === false && "error" in archiveState ? archiveState.error : null;

  const difficultyRangeStyle = useMemo(
    () => exerciseDifficultyRangeSliderStyle(values.difficulty),
    [values.difficulty],
  );

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        {displayError ? (
          <p role="alert" className="text-sm text-destructive">
            {displayError}
          </p>
        ) : null}
        {exercise ? <input type="hidden" name="id" value={exercise.id} /> : null}
        {viewHint ? <input type="hidden" name="view" value={viewHint} /> : null}
        <input type="hidden" name="regionRefId" value={values.regionRefId ?? ""} />
        <input type="hidden" name="mediaUrl" value={values.mediaUrl} />
        <input type="hidden" name="mediaType" value={values.mediaType} />

        <div className="flex flex-col gap-3">
          <Label htmlFor="ex-title">Название</Label>
          <Input
            id="ex-title"
            name="title"
            required
            value={values.title}
            onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
            placeholder="Например, разгибание колена сидя"
          />
        </div>

        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">Медиа</span>
          <MediaLibraryPickerDialog
            kind="image_or_video"
            value={values.mediaUrl}
            selectedPreviewKind={values.mediaType || undefined}
            pickerTitle="Изображение, GIF или видео"
            onChange={(url, meta) => {
              setValues((prev) => {
                let nextTitle = prev.title;
                let nextType: ExerciseFormValues["mediaType"] = "";
                if (url && meta) {
                  nextType = exerciseMediaTypeFromPick(meta);
                  if (nextTitle.trim() === "") nextTitle = exerciseTitleFromPickMeta(meta);
                }
                return { ...prev, mediaUrl: url, mediaType: nextType, title: nextTitle };
              });
            }}
          />
        </div>

        <div className="flex flex-col gap-3">
          <Label htmlFor="ex-difficulty">Сложность (1–10)</Label>
          <div className="flex flex-wrap items-center gap-3 py-1">
            <input
              id="ex-difficulty"
              name="difficulty1_10"
              type="range"
              min={1}
              max={10}
              value={values.difficulty}
              onChange={(e) => setValues((v) => ({ ...v, difficulty: Number(e.target.value) }))}
              className="doctor-exercise-difficulty-range touch-manipulation w-full max-w-xs"
              style={difficultyRangeStyle}
            />
            <span className="text-sm tabular-nums text-muted-foreground">{values.difficulty}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Label htmlFor="ex-tags">Теги (через запятую)</Label>
          <Input
            id="ex-tags"
            name="tags"
            value={values.tags}
            onChange={(e) => setValues((v) => ({ ...v, tags: e.target.value }))}
            placeholder="колено, дома"
          />
        </div>

        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">Регион</span>
          <ReferenceSelect
            categoryCode="body_region"
            value={values.regionRefId}
            onChange={(refId, label) => {
              setValues((v) => ({ ...v, regionRefId: refId }));
              setRegionLabel(label);
            }}
            placeholder="Выберите регион"
          />
          {regionLabel ? (
            <p className="text-xs text-muted-foreground">Выбрано: {regionLabel}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <Label>Тип нагрузки</Label>
          <input type="hidden" name="loadType" value={values.loadType} />
          <Select
            value={values.loadType || undefined}
            onValueChange={(v) => {
              if (v) setValues((prev) => ({ ...prev, loadType: v as ExerciseLoadType }));
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

        <div className="flex flex-col gap-3">
          <Label htmlFor="ex-desc">Описание</Label>
          <Textarea
            id="ex-desc"
            name="description"
            className="min-h-[100px]"
            value={values.description}
            onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            placeholder="Краткая техника выполнения"
          />
        </div>

        <div className="flex flex-col gap-3">
          <Label htmlFor="ex-contra">Противопоказания</Label>
          <Textarea
            id="ex-contra"
            name="contraindications"
            className="min-h-[72px]"
            value={values.contraindications}
            onChange={(e) => setValues((v) => ({ ...v, contraindications: e.target.value }))}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={savePending}>
            {savePending ? "Сохранение…" : exercise ? "Сохранить" : "Создать упражнение"}
          </Button>
        </div>
      </form>

      {exercise ? (
        <div className="border-t border-border/60 pt-4">
          <div className="mb-3 rounded-md border border-border/60 bg-muted/20 p-3">
            <p className="text-sm font-medium text-foreground">Где используется</p>
            {usageBusy ? (
              <p className="mt-1 text-sm text-muted-foreground">Загрузка…</p>
            ) : usageLoadError ? (
              <p className="mt-1 text-sm text-muted-foreground">{usageLoadError}</p>
            ) : (
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
                {usageLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </div>

          {archiveError ? (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {archiveError}
            </p>
          ) : null}

          <form ref={archiveFormRef} action={archiveFormAction} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={exercise.id} />
            {viewHint ? <input type="hidden" name="view" value={viewHint} /> : null}
            <input ref={acknowledgeRef} type="hidden" name="acknowledgeUsageWarning" value="" />
            <Button
              type="submit"
              variant="destructive"
              disabled={archivePending}
              onClick={() => {
                if (acknowledgeRef.current) acknowledgeRef.current.value = "";
              }}
            >
              {archivePending ? "Архивация…" : "Архивировать"}
            </Button>
          </form>

          <Dialog open={warnOpen} onOpenChange={setWarnOpen}>
            <DialogContent showCloseButton className="max-w-md">
              <DialogHeader>
                <DialogTitle>Элемент уже используется</DialogTitle>
                <DialogDescription className="space-y-2">
                  <span className="block">
                    Архивация уберёт упражнение из каталога для новых назначений. Уже выданные назначения и история не
                    удаляются.
                  </span>
                  {warnLines.length ? (
                    <ul className="list-inside list-disc space-y-1">
                      {warnLines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button type="button" variant="outline" onClick={() => setWarnOpen(false)}>
                  Отмена
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={archivePending}
                  onClick={() => {
                    if (acknowledgeRef.current) acknowledgeRef.current.value = "1";
                    setWarnOpen(false);
                    queueMicrotask(() => archiveFormRef.current?.requestSubmit());
                  }}
                >
                  Архивировать всё равно
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}
    </div>
  );
}
