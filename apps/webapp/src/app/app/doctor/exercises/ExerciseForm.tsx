"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DoctorDifficulty1to10Slider } from "@/shared/ui/doctor/DoctorDifficulty1to10Slider";
import { ReferenceSelect } from "@/shared/ui/ReferenceSelect";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  EXERCISE_LOAD_TYPE_OPTIONS,
} from "@/modules/lfk-exercises/exerciseLoadTypeOptions";
import type { Exercise, ExerciseLoadType, ExerciseUsageSnapshot } from "@/modules/lfk-exercises/types";
import type { ReferenceItemDto } from "@/modules/references/referenceCache";
import type { RecommendationListFilterScope } from "@/shared/lib/doctorCatalogListStatus";
import { MediaLibraryPickerDialog } from "@/app/app/doctor/content/MediaLibraryPickerDialog";
import { archiveDoctorExercise, fetchDoctorExerciseUsageSnapshot, saveDoctorExercise, unarchiveDoctorExercise } from "./actions";
import type { ArchiveDoctorExerciseState, SaveDoctorExerciseState, UnarchiveDoctorExerciseState } from "./actionsShared";
import { exerciseMediaTypeFromPick, exerciseTitleFromPickMeta } from "./exerciseMediaFromLibrary";
import { doctorExerciseUsageHref } from "./exerciseUsageDocLinks";
import {
  exerciseUsageHasAnyReference,
  exerciseUsageSections,
  type ExerciseUsageSection,
} from "./exerciseUsageSummaryText";

const EXERCISE_LOAD_TYPE_ITEMS: ReferenceItemDto[] = EXERCISE_LOAD_TYPE_OPTIONS.map((o, idx) => ({
  id: `exercise-load-type-${o.value}`,
  code: o.value,
  title: o.label,
  sortOrder: idx + 1,
}));

function ExerciseUsageSectionsView({ sections }: { sections: ExerciseUsageSection[] }) {
  if (sections.length === 0) {
    return <p className="mt-1 text-sm text-muted-foreground">Пока не используется</p>;
  }
  return (
    <div className="mt-2 space-y-3">
      {sections.map((sec) => (
        <div key={sec.key}>
          <p className="text-sm text-muted-foreground">{sec.summary}</p>
          {sec.refs.length > 0 ? (
            <ul className="mt-1 ml-3 list-disc space-y-0.5 text-sm">
              {sec.refs.map((r) => (
                <li key={`${sec.key}-${r.kind}-${r.id}`}>
                  <Link
                    href={doctorExerciseUsageHref(r)}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {sec.total > sec.refs.length ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Показаны первые {sec.refs.length} из {sec.total}.
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
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
  unarchiveAction?: (
    _prev: UnarchiveDoctorExerciseState | null,
    formData: FormData,
  ) => Promise<UnarchiveDoctorExerciseState>;
  /** Для inline-редиректов: сохранить `status` в query (каталог активные/все/архив). */
  listArchiveScope?: RecommendationListFilterScope;
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
  unarchiveAction = unarchiveDoctorExercise,
  viewHint,
  listArchiveScope,
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
  const [archiveUsageAck, setArchiveUsageAck] = useState(false);
  const archiveFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setValues(exerciseToFormValues(exercise));
    setRegionLabel("");
    setLocalError(null);
    setUsageLoadError(null);
    setWarnOpen(false);
    setArchiveUsageAck(false);
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

  const [unarchiveState, unarchiveFormAction, unarchivePending] = useActionState(
    unarchiveAction,
    null as UnarchiveDoctorExerciseState | null,
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

  const usageSections = useMemo(() => {
    if (!usage || !exerciseUsageHasAnyReference(usage)) return [];
    return exerciseUsageSections(usage);
  }, [usage]);

  const warnSections = useMemo(() => {
    if (
      archiveState?.ok === false &&
      "code" in archiveState &&
      archiveState.code === "USAGE_CONFIRMATION_REQUIRED"
    ) {
      const u = archiveState.usage;
      if (!exerciseUsageHasAnyReference(u)) return [];
      return exerciseUsageSections(u);
    }
    return [];
  }, [archiveState]);

  const archiveError =
    archiveState?.ok === false && "error" in archiveState ? archiveState.error : null;

  const unarchiveError =
    unarchiveState?.ok === false && "error" in unarchiveState ? unarchiveState.error : null;

  const isArchived = !!exercise?.isArchived;

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
        {listArchiveScope ? <input type="hidden" name="status" value={listArchiveScope} /> : null}
        <input type="hidden" name="regionRefId" value={values.regionRefId ?? ""} />
        <input type="hidden" name="mediaUrl" value={values.mediaUrl} />
        <input type="hidden" name="mediaType" value={values.mediaType} />

        <fieldset disabled={isArchived} className="m-0 min-w-0 border-0 p-0">
          <legend className="sr-only">Поля упражнения</legend>
          <div className="flex flex-col gap-4">
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

            <DoctorDifficulty1to10Slider
              id="ex-difficulty"
              name="difficulty1_10"
              value={values.difficulty}
              onChange={(n) => setValues((v) => ({ ...v, difficulty: n }))}
              label="Сложность:"
            />

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
              <Label htmlFor="ex-load-type">Тип нагрузки</Label>
              <ReferenceSelect
                id="ex-load-type"
                name="loadType"
                prefetchedItems={EXERCISE_LOAD_TYPE_ITEMS}
                valueMatch="code"
                submitField="code"
                value={values.loadType || null}
                onChange={(code) => {
                  setValues((prev) => ({ ...prev, loadType: code ? (code as ExerciseLoadType) : "" }));
                }}
                placeholder="Выберите тип нагрузки"
                clearOptionLabel="Без типа нагрузки"
                className="max-w-md"
                showAllOnFocus
              />
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
          </div>
        </fieldset>
      </form>

      {exercise && isArchived ? (
        <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
          <p className="font-medium text-foreground">Упражнение в архиве</p>
          <p className="mt-1 text-muted-foreground">Верните из архива, чтобы снова назначать и редактировать.</p>
          <div className="mb-3 mt-3 rounded-md border border-border/60 bg-muted/20 p-3">
            <p className="text-sm font-medium text-foreground">Где используется</p>
            {usageBusy ? (
              <p className="mt-1 text-sm text-muted-foreground">Загрузка…</p>
            ) : usageLoadError ? (
              <p className="mt-1 text-sm text-muted-foreground">{usageLoadError}</p>
            ) : !usage ? null : !exerciseUsageHasAnyReference(usage) ? (
              <p className="mt-1 text-sm text-muted-foreground">Пока не используется</p>
            ) : (
              <ExerciseUsageSectionsView sections={usageSections} />
            )}
          </div>
          {unarchiveError ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {unarchiveError}
            </p>
          ) : null}
          <form action={unarchiveFormAction} className="mt-3 flex flex-col gap-2">
            <input type="hidden" name="id" value={exercise.id} />
            {viewHint ? <input type="hidden" name="view" value={viewHint} /> : null}
            {listArchiveScope ? <input type="hidden" name="status" value={listArchiveScope} /> : null}
            <Button type="submit" variant="secondary" disabled={unarchivePending}>
              {unarchivePending ? "Восстановление…" : "Вернуть из архива"}
            </Button>
          </form>
        </div>
      ) : null}

      {exercise && !isArchived ? (
        <div className="border-t border-border/60 pt-4">
          <div className="mb-3 rounded-md border border-border/60 bg-muted/20 p-3">
            <p className="text-sm font-medium text-foreground">Где используется</p>
            {usageBusy ? (
              <p className="mt-1 text-sm text-muted-foreground">Загрузка…</p>
            ) : usageLoadError ? (
              <p className="mt-1 text-sm text-muted-foreground">{usageLoadError}</p>
            ) : !usage ? null : !exerciseUsageHasAnyReference(usage) ? (
              <p className="mt-1 text-sm text-muted-foreground">Пока не используется</p>
            ) : (
              <ExerciseUsageSectionsView sections={usageSections} />
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
            {listArchiveScope ? <input type="hidden" name="status" value={listArchiveScope} /> : null}
            <input type="hidden" name="acknowledgeUsageWarning" value={archiveUsageAck ? "1" : ""} readOnly />
            <Button
              type="submit"
              variant="destructive"
              disabled={archivePending}
              onClick={() => {
                setArchiveUsageAck(false);
              }}
            >
              {archivePending ? "Архивация…" : "Архивировать"}
            </Button>
          </form>

          <Dialog open={warnOpen} onOpenChange={setWarnOpen}>
            <DialogContent showCloseButton className="max-w-md">
              <DialogHeader>
                <DialogTitle>Элемент уже используется</DialogTitle>
                <div className="space-y-2 text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground">
                  <span className="block">
                    Архивация уберёт упражнение из каталога для новых назначений. Уже выданные назначения и история не
                    удаляются.
                  </span>
                  {!warnSections.length &&
                  archiveState?.ok === false &&
                  "code" in archiveState &&
                  archiveState.code === "USAGE_CONFIRMATION_REQUIRED" &&
                  !exerciseUsageHasAnyReference(archiveState.usage) ? (
                    <span className="block text-sm">
                      Упражнение помечено как используемое — проверьте связи перед архивацией.
                    </span>
                  ) : warnSections.length ? (
                    <ExerciseUsageSectionsView sections={warnSections} />
                  ) : null}
                </div>
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
                    setArchiveUsageAck(true);
                    setWarnOpen(false);
                    queueMicrotask(() => {
                      archiveFormRef.current?.requestSubmit();
                      setArchiveUsageAck(false);
                    });
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
