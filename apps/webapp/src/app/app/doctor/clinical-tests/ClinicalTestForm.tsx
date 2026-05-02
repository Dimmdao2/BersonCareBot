"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
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
import type { ExerciseLoadType } from "@/modules/lfk-exercises/types";
import type { ClinicalTest, ClinicalTestUsageSnapshot } from "@/modules/tests/types";
import { cn } from "@/lib/utils";
import { MediaLibraryPickerDialog } from "@/app/app/doctor/content/MediaLibraryPickerDialog";
import { archiveClinicalTest, fetchDoctorClinicalTestUsageSnapshot, saveClinicalTest } from "./actions";
import type { ArchiveClinicalTestState, SaveClinicalTestState } from "./actionsShared";
import {
  exerciseMediaTypeFromPick,
  exerciseTitleFromPickMeta,
} from "@/app/app/doctor/exercises/exerciseMediaFromLibrary";
import { CLINICAL_TESTS_PATH } from "./paths";
import { doctorClinicalTestUsageHref } from "./clinicalTestsUsageDocLinks";
import {
  clinicalTestUsageHasAnyReference,
  clinicalTestUsageSections,
  type ClinicalTestUsageSection,
} from "./clinicalTestsUsageSummaryText";

function ClinicalTestUsageSectionsView({ sections }: { sections: ClinicalTestUsageSection[] }) {
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
                    href={doctorClinicalTestUsageHref(r)}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {sec.refs.length > 0 && sec.total > sec.refs.length ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Показаны первые {sec.refs.length} из {sec.total}.
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export type ClinicalTestFormValues = {
  title: string;
  description: string;
  testType: string;
  scoringConfigJson: string;
  tags: string;
  mediaUrl: string;
  mediaType: "" | "image" | "video" | "gif";
};

function scoringTextFromTest(t: ClinicalTest | null | undefined): string {
  if (t?.scoringConfig == null) return "";
  try {
    return JSON.stringify(t.scoringConfig, null, 2);
  } catch {
    return "";
  }
}

export function clinicalTestToFormValues(test: ClinicalTest | null | undefined): ClinicalTestFormValues {
  const initialMedia = test?.media?.[0];
  return {
    title: test?.title ?? "",
    description: test?.description ?? "",
    testType: test?.testType ?? "",
    scoringConfigJson: scoringTextFromTest(test ?? null),
    tags: test?.tags?.join(", ") ?? "",
    mediaUrl: initialMedia?.mediaUrl ?? "",
    mediaType: (initialMedia?.mediaType ?? "") as ClinicalTestFormValues["mediaType"],
  };
}

type ClinicalTestFormProps = {
  test?: ClinicalTest | null;
  backHref?: string;
  /** Режим каталога master-detail — передаётся в форму как `view` для редиректа после сохранения. */
  workspaceView?: "tiles" | "list";
  /** Дополнить редирект после save/archive параметрами списка (`q`, `titleSort`, `region`, `load`). */
  workspaceListPreserve?: {
    q?: string;
    titleSort?: "asc" | "desc" | null;
    regionRefId?: string;
    loadType?: ExerciseLoadType;
  };
  saveAction?: (
    _prev: SaveClinicalTestState | null,
    formData: FormData,
  ) => Promise<SaveClinicalTestState>;
  archiveAction?: (
    _prev: ArchiveClinicalTestState | null,
    formData: FormData,
  ) => Promise<ArchiveClinicalTestState>;
  /**
   * Snapshot с сервера (например split-view с выбранным тестом). Если не передан — usage
   * подгружается через `fetchDoctorClinicalTestUsageSnapshot`.
   */
  externalUsageSnapshot?: ClinicalTestUsageSnapshot;
};

export function ClinicalTestForm({
  test,
  backHref = CLINICAL_TESTS_PATH,
  workspaceView,
  workspaceListPreserve,
  saveAction = saveClinicalTest,
  archiveAction = archiveClinicalTest,
  externalUsageSnapshot,
}: ClinicalTestFormProps) {
  const recordKey = test?.id ?? "create";
  const [values, setValues] = useState<ClinicalTestFormValues>(() => clinicalTestToFormValues(test));
  const [localError, setLocalError] = useState<string | null>(null);
  const [usage, setUsage] = useState<ClinicalTestUsageSnapshot | null>(null);
  const [usageLoadError, setUsageLoadError] = useState<string | null>(null);
  const [usageBusy, setUsageBusy] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const [archiveUsageAck, setArchiveUsageAck] = useState(false);
  const archiveFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setValues(clinicalTestToFormValues(test));
    setLocalError(null);
    setUsageLoadError(null);
    setWarnOpen(false);
    setArchiveUsageAck(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- сброс при смене записи
  }, [recordKey]);

  useEffect(() => {
    if (!test?.id) {
      setUsage(null);
      return;
    }
    if (externalUsageSnapshot !== undefined) {
      setUsage(externalUsageSnapshot);
      return;
    }
    let cancelled = false;
    setUsageBusy(true);
    void fetchDoctorClinicalTestUsageSnapshot(test.id)
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
  }, [test?.id, externalUsageSnapshot]);

  const wrappedSave = useCallback(
    async (prev: SaveClinicalTestState | null, formData: FormData) => {
      setLocalError(null);
      const r = await saveAction(prev, formData);
      if (!r.ok && r.error) setLocalError(r.error);
      return r;
    },
    [saveAction],
  );

  const [, formAction, savePending] = useActionState(wrappedSave, null as SaveClinicalTestState | null);

  const [archiveState, archiveFormAction, archivePending] = useActionState(
    archiveAction,
    null as ArchiveClinicalTestState | null,
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

  const usageSections = useMemo(() => {
    if (!usage || !clinicalTestUsageHasAnyReference(usage)) return [];
    return clinicalTestUsageSections(usage);
  }, [usage]);

  const warnSections = useMemo(() => {
    if (
      archiveState?.ok === false &&
      "code" in archiveState &&
      archiveState.code === "USAGE_CONFIRMATION_REQUIRED"
    ) {
      const u = archiveState.usage;
      if (!clinicalTestUsageHasAnyReference(u)) return [];
      return clinicalTestUsageSections(u);
    }
    return [];
  }, [archiveState]);

  const archiveError =
    archiveState?.ok === false && "error" in archiveState ? archiveState.error : null;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        {localError ? (
          <p role="alert" className="text-sm text-destructive">
            {localError}
          </p>
        ) : null}
        {test ? <input type="hidden" name="id" value={test.id} /> : null}
        {workspaceView ? <input type="hidden" name="view" value={workspaceView} /> : null}
        {workspaceListPreserve?.q != null && workspaceListPreserve.q !== "" ? (
          <input type="hidden" name="listQ" value={workspaceListPreserve.q} />
        ) : null}
        {workspaceListPreserve?.titleSort === "asc" || workspaceListPreserve?.titleSort === "desc" ? (
          <input type="hidden" name="listTitleSort" value={workspaceListPreserve.titleSort} />
        ) : null}
        {workspaceListPreserve?.regionRefId != null && workspaceListPreserve.regionRefId !== "" ? (
          <input type="hidden" name="listRegion" value={workspaceListPreserve.regionRefId} />
        ) : null}
        {workspaceListPreserve?.loadType === "strength" ||
        workspaceListPreserve?.loadType === "stretch" ||
        workspaceListPreserve?.loadType === "balance" ||
        workspaceListPreserve?.loadType === "cardio" ||
        workspaceListPreserve?.loadType === "other" ? (
          <input type="hidden" name="listLoad" value={workspaceListPreserve.loadType} />
        ) : null}
        <input type="hidden" name="mediaUrl" value={values.mediaUrl} />
        <input type="hidden" name="mediaType" value={values.mediaType} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="ct-title">Название</Label>
          <Input
            id="ct-title"
            name="title"
            required
            value={values.title}
            onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
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
                let nextType: ClinicalTestFormValues["mediaType"] = "";
                if (url && meta) {
                  nextType = exerciseMediaTypeFromPick(meta);
                  if (nextTitle.trim() === "") nextTitle = exerciseTitleFromPickMeta(meta);
                }
                return { ...prev, mediaUrl: url, mediaType: nextType, title: nextTitle };
              });
            }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="ct-desc">Описание</Label>
          <Textarea
            id="ct-desc"
            name="description"
            className="min-h-[80px]"
            value={values.description}
            onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="ct-type">Тип теста (произвольная метка)</Label>
          <Input
            id="ct-type"
            name="testType"
            value={values.testType}
            onChange={(e) => setValues((v) => ({ ...v, testType: e.target.value }))}
            placeholder="например screening"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="ct-score">Scoring config (JSON, опционально)</Label>
          <Textarea
            id="ct-score"
            name="scoringConfigJson"
            className="min-h-[120px] font-mono text-sm"
            value={values.scoringConfigJson}
            onChange={(e) => setValues((v) => ({ ...v, scoringConfigJson: e.target.value }))}
            placeholder='{"threshold": 5}'
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="ct-tags">Теги (через запятую)</Label>
          <Input
            id="ct-tags"
            name="tags"
            value={values.tags}
            onChange={(e) => setValues((v) => ({ ...v, tags: e.target.value }))}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={savePending}>
            {savePending ? "Сохранение…" : test ? "Сохранить" : "Создать тест"}
          </Button>
          <Link href={backHref} className={cn(buttonVariants({ variant: "outline" }))}>
            К списку
          </Link>
        </div>
      </form>

      {test ? (
        <div className="border-t border-border/60 pt-4">
          <div className="mb-3 rounded-md border border-border/60 bg-muted/20 p-3">
            <p className="text-sm font-medium text-foreground">Где используется</p>
            {usageBusy ? (
              <p className="mt-1 text-sm text-muted-foreground">Загрузка…</p>
            ) : usageLoadError ? (
              <p className="mt-1 text-sm text-muted-foreground">{usageLoadError}</p>
            ) : !usage ? null : !clinicalTestUsageHasAnyReference(usage) ? (
              <p className="mt-1 text-sm text-muted-foreground">Пока не используется</p>
            ) : (
              <ClinicalTestUsageSectionsView sections={usageSections} />
            )}
          </div>

          {archiveError ? (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {archiveError}
            </p>
          ) : null}

          <form ref={archiveFormRef} action={archiveFormAction} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={test.id} />
            {workspaceView ? <input type="hidden" name="view" value={workspaceView} /> : null}
            {workspaceListPreserve?.q != null && workspaceListPreserve.q !== "" ? (
              <input type="hidden" name="listQ" value={workspaceListPreserve.q} />
            ) : null}
            {workspaceListPreserve?.titleSort === "asc" || workspaceListPreserve?.titleSort === "desc" ? (
              <input type="hidden" name="listTitleSort" value={workspaceListPreserve.titleSort} />
            ) : null}
            {workspaceListPreserve?.regionRefId != null && workspaceListPreserve.regionRefId !== "" ? (
              <input type="hidden" name="listRegion" value={workspaceListPreserve.regionRefId} />
            ) : null}
            {workspaceListPreserve?.loadType === "strength" ||
            workspaceListPreserve?.loadType === "stretch" ||
            workspaceListPreserve?.loadType === "balance" ||
            workspaceListPreserve?.loadType === "cardio" ||
            workspaceListPreserve?.loadType === "other" ? (
              <input type="hidden" name="listLoad" value={workspaceListPreserve.loadType} />
            ) : null}
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
                    Архивация уберёт тест из каталога для новых наборов и шаблонов. Уже выданные программы и история
                    результатов не удаляются.
                  </span>
                  {!warnSections.length &&
                  archiveState?.ok === false &&
                  "code" in archiveState &&
                  archiveState.code === "USAGE_CONFIRMATION_REQUIRED" &&
                  !clinicalTestUsageHasAnyReference(archiveState.usage) ? (
                    <span className="block text-sm">
                      Тест помечен как используемый — проверьте связи перед архивацией.
                    </span>
                  ) : warnSections.length ? (
                    <ClinicalTestUsageSectionsView sections={warnSections} />
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
