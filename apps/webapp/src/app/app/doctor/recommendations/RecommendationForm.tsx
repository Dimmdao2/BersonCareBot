"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Recommendation, RecommendationArchiveScope } from "@/modules/recommendations/types";
import { cn } from "@/lib/utils";
import { MediaLibraryPickerDialog } from "@/app/app/doctor/content/MediaLibraryPickerDialog";
import { archiveRecommendation, saveRecommendation } from "./actions";
import type { SaveRecommendationState } from "./actionsShared";
import {
  exerciseMediaTypeFromPick,
  exerciseTitleFromPickMeta,
} from "@/app/app/doctor/exercises/exerciseMediaFromLibrary";
import { RECOMMENDATIONS_PATH } from "./paths";

type FormValues = {
  title: string;
  bodyMd: string;
  tags: string;
  mediaUrl: string;
  mediaType: "" | "image" | "video" | "gif";
};

function toValues(r: Recommendation | null | undefined): FormValues {
  const m = r?.media?.[0];
  return {
    title: r?.title ?? "",
    bodyMd: r?.bodyMd ?? "",
    tags: r?.tags?.join(", ") ?? "",
    mediaUrl: m?.mediaUrl ?? "",
    mediaType: (m?.mediaType ?? "") as FormValues["mediaType"],
  };
}

type Props = {
  recommendation?: Recommendation | null;
  backHref?: string;
  /** Режим каталога master-detail — передаётся как `view` для редиректа после сохранения. */
  workspaceView?: "tiles" | "list";
  /** Дополнить редирект после save/archive параметрами списка (`q`, `titleSort`, `scope`). */
  workspaceListPreserve?: {
    q?: string;
    titleSort?: "asc" | "desc" | null;
    scope?: RecommendationArchiveScope;
  };
  saveAction?: (
    _prev: SaveRecommendationState | null,
    formData: FormData,
  ) => Promise<SaveRecommendationState>;
  archiveAction?: (formData: FormData) => Promise<void>;
};

export function RecommendationForm({
  recommendation,
  backHref = RECOMMENDATIONS_PATH,
  workspaceView,
  workspaceListPreserve,
  saveAction = saveRecommendation,
  archiveAction = archiveRecommendation,
}: Props) {
  const recordKey = recommendation?.id ?? "create";
  const [values, setValues] = useState<FormValues>(() => toValues(recommendation));
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setValues(toValues(recommendation));
    setLocalError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordKey]);

  const wrappedSave = useCallback(
    async (prev: SaveRecommendationState | null, formData: FormData) => {
      setLocalError(null);
      const r = await saveAction(prev, formData);
      if (!r.ok && r.error) setLocalError(r.error);
      return r;
    },
    [saveAction],
  );

  const [, formAction, pending] = useActionState(wrappedSave, null as SaveRecommendationState | null);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        {localError ? (
          <p role="alert" className="text-sm text-destructive">
            {localError}
          </p>
        ) : null}
        {recommendation ? <input type="hidden" name="id" value={recommendation.id} /> : null}
        {workspaceView ? <input type="hidden" name="view" value={workspaceView} /> : null}
        {workspaceListPreserve?.q != null && workspaceListPreserve.q !== "" ? (
          <input type="hidden" name="listQ" value={workspaceListPreserve.q} />
        ) : null}
        {workspaceListPreserve?.titleSort === "asc" || workspaceListPreserve?.titleSort === "desc" ? (
          <input type="hidden" name="listTitleSort" value={workspaceListPreserve.titleSort} />
        ) : null}
        {workspaceListPreserve?.scope != null && workspaceListPreserve.scope !== "active" ? (
          <input type="hidden" name="listScope" value={workspaceListPreserve.scope} />
        ) : null}
        <input type="hidden" name="mediaUrl" value={values.mediaUrl} />
        <input type="hidden" name="mediaType" value={values.mediaType} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="rec-title">Название</Label>
          <Input
            id="rec-title"
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
                let nextType: FormValues["mediaType"] = "";
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
          <Label htmlFor="rec-body">Текст (Markdown)</Label>
          <Textarea
            id="rec-body"
            name="bodyMd"
            className="min-h-[200px] font-mono text-sm"
            required
            value={values.bodyMd}
            onChange={(e) => setValues((v) => ({ ...v, bodyMd: e.target.value }))}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="rec-tags">Теги (через запятую)</Label>
          <Input
            id="rec-tags"
            name="tags"
            value={values.tags}
            onChange={(e) => setValues((v) => ({ ...v, tags: e.target.value }))}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Сохранение…" : recommendation ? "Сохранить" : "Создать"}
          </Button>
          <Link href={backHref} className={cn(buttonVariants({ variant: "outline" }))}>
            К списку
          </Link>
        </div>
      </form>

      {recommendation ? (
        <form action={archiveAction} className="border-t border-border/60 pt-4">
          <input type="hidden" name="id" value={recommendation.id} />
          {workspaceView ? <input type="hidden" name="view" value={workspaceView} /> : null}
          {workspaceListPreserve?.q != null && workspaceListPreserve.q !== "" ? (
            <input type="hidden" name="listQ" value={workspaceListPreserve.q} />
          ) : null}
          {workspaceListPreserve?.titleSort === "asc" || workspaceListPreserve?.titleSort === "desc" ? (
            <input type="hidden" name="listTitleSort" value={workspaceListPreserve.titleSort} />
          ) : null}
          {workspaceListPreserve?.scope != null && workspaceListPreserve.scope !== "active" ? (
            <input type="hidden" name="listScope" value={workspaceListPreserve.scope} />
          ) : null}
          <Button type="submit" variant="destructive">
            Архивировать
          </Button>
        </form>
      ) : null}
    </div>
  );
}
