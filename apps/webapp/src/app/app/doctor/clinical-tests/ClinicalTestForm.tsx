"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ClinicalTest } from "@/modules/tests/types";
import { cn } from "@/lib/utils";
import { MediaLibraryPickerDialog } from "@/app/app/doctor/content/MediaLibraryPickerDialog";
import { archiveClinicalTest, saveClinicalTest } from "./actions";
import type { SaveClinicalTestState } from "./actionsShared";
import {
  exerciseMediaTypeFromPick,
  exerciseTitleFromPickMeta,
} from "@/app/app/doctor/exercises/exerciseMediaFromLibrary";
import { CLINICAL_TESTS_PATH } from "./paths";

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
  saveAction?: (
    _prev: SaveClinicalTestState | null,
    formData: FormData,
  ) => Promise<SaveClinicalTestState>;
  archiveAction?: (formData: FormData) => Promise<void>;
};

export function ClinicalTestForm({
  test,
  backHref = CLINICAL_TESTS_PATH,
  workspaceView,
  saveAction = saveClinicalTest,
  archiveAction = archiveClinicalTest,
}: ClinicalTestFormProps) {
  const recordKey = test?.id ?? "create";
  const [values, setValues] = useState<ClinicalTestFormValues>(() => clinicalTestToFormValues(test));
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setValues(clinicalTestToFormValues(test));
    setLocalError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- сброс при смене записи
  }, [recordKey]);

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

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        {localError ? (
          <p role="alert" className="text-sm text-destructive">
            {localError}
          </p>
        ) : null}
        {test ? <input type="hidden" name="id" value={test.id} /> : null}
        {workspaceView ? <input type="hidden" name="view" value={workspaceView} /> : null}
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

        <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
          <p className="text-sm font-medium">Медиа</p>
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
        <form action={archiveAction} className="border-t border-border/60 pt-4">
          <input type="hidden" name="id" value={test.id} />
          {workspaceView ? <input type="hidden" name="view" value={workspaceView} /> : null}
          <Button type="submit" variant="destructive">
            Архивировать
          </Button>
        </form>
      ) : null}
    </div>
  );
}
