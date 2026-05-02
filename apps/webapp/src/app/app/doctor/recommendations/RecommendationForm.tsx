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
import { MarkdownEditorToastUi } from "@/shared/ui/markdown/MarkdownEditorToastUi";
import { RECOMMENDATION_DOMAIN_ITEMS } from "@/modules/recommendations/recommendationDomain";
import type { RecommendationDomain } from "@/modules/recommendations/recommendationDomain";
import type { Recommendation, RecommendationUsageSnapshot } from "@/modules/recommendations/types";
import { ReferenceSelect } from "@/shared/ui/ReferenceSelect";
import { cn } from "@/lib/utils";
import { MediaLibraryPickerDialog } from "@/app/app/doctor/content/MediaLibraryPickerDialog";
import {
  archiveRecommendation,
  fetchDoctorRecommendationUsageSnapshot,
  saveRecommendation,
} from "./actions";
import type { ArchiveRecommendationState, SaveRecommendationState } from "./actionsShared";
import {
  exerciseMediaTypeFromPick,
  exerciseTitleFromPickMeta,
} from "@/app/app/doctor/exercises/exerciseMediaFromLibrary";
import { RECOMMENDATIONS_PATH } from "./paths";
import { doctorRecommendationUsageHref } from "./recommendationUsageDocLinks";
import {
  recommendationUsageHasAnyReference,
  recommendationUsageSections,
  type RecommendationUsageSection,
} from "./recommendationUsageSummaryText";

function RecommendationUsageSectionsView({ sections }: { sections: RecommendationUsageSection[] }) {
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
                    href={doctorRecommendationUsageHref(r)}
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

type FormValues = {
  title: string;
  bodyMd: string;
  tags: string;
  mediaUrl: string;
  mediaType: "" | "image" | "video" | "gif";
  /** Код области (`RecommendationDomain`), как в `RECOMMENDATION_DOMAIN_ITEMS.code`. */
  domainCode: string | null;
};

function toValues(r: Recommendation | null | undefined): FormValues {
  const m = r?.media?.[0];
  return {
    title: r?.title ?? "",
    bodyMd: r?.bodyMd ?? "",
    tags: r?.tags?.join(", ") ?? "",
    mediaUrl: m?.mediaUrl ?? "",
    mediaType: (m?.mediaType ?? "") as FormValues["mediaType"],
    domainCode: r?.domain ?? null,
  };
}

type Props = {
  recommendation?: Recommendation | null;
  backHref?: string;
  /** Режим каталога master-detail — передаётся как `view` для редиректа после сохранения. */
  workspaceView?: "tiles" | "list";
  /** Дополнить редирект после save/archive параметрами списка (`q`, `titleSort`, `region`, `domain`). */
  workspaceListPreserve?: {
    q?: string;
    titleSort?: "asc" | "desc" | null;
    regionRefId?: string;
    domain?: RecommendationDomain;
  };
  saveAction?: (
    _prev: SaveRecommendationState | null,
    formData: FormData,
  ) => Promise<SaveRecommendationState>;
  archiveAction?: (
    _prev: ArchiveRecommendationState | null,
    formData: FormData,
  ) => Promise<ArchiveRecommendationState>;
  externalUsageSnapshot?: RecommendationUsageSnapshot;
};

export function RecommendationForm({
  recommendation,
  backHref = RECOMMENDATIONS_PATH,
  workspaceView,
  workspaceListPreserve,
  saveAction = saveRecommendation,
  archiveAction = archiveRecommendation,
  externalUsageSnapshot,
}: Props) {
  const recordKey = recommendation?.id ?? "create";
  const [values, setValues] = useState<FormValues>(() => toValues(recommendation));
  const [localError, setLocalError] = useState<string | null>(null);
  const [usage, setUsage] = useState<RecommendationUsageSnapshot | null>(null);
  const [usageLoadError, setUsageLoadError] = useState<string | null>(null);
  const [usageBusy, setUsageBusy] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const [archiveUsageAck, setArchiveUsageAck] = useState(false);
  const archiveFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setValues(toValues(recommendation));
    setLocalError(null);
    setUsageLoadError(null);
    setWarnOpen(false);
    setArchiveUsageAck(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordKey]);

  useEffect(() => {
    if (!recommendation?.id) {
      setUsage(null);
      return;
    }
    if (externalUsageSnapshot !== undefined) {
      setUsage(externalUsageSnapshot);
      return;
    }
    let cancelled = false;
    setUsageBusy(true);
    void fetchDoctorRecommendationUsageSnapshot(recommendation.id)
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
  }, [recommendation?.id, externalUsageSnapshot]);

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

  const [archiveState, archiveFormAction, archivePending] = useActionState(
    archiveAction,
    null as ArchiveRecommendationState | null,
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
    if (!usage || !recommendationUsageHasAnyReference(usage)) return [];
    return recommendationUsageSections(usage);
  }, [usage]);

  const warnSections = useMemo(() => {
    if (
      archiveState?.ok === false &&
      "code" in archiveState &&
      archiveState.code === "USAGE_CONFIRMATION_REQUIRED"
    ) {
      const u = archiveState.usage;
      if (!recommendationUsageHasAnyReference(u)) return [];
      return recommendationUsageSections(u);
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
        {recommendation ? <input type="hidden" name="id" value={recommendation.id} /> : null}
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
        {workspaceListPreserve?.domain != null ? (
          <input type="hidden" name="listDomain" value={workspaceListPreserve.domain} />
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

        <div className="flex flex-col gap-2">
          <Label className="text-sm font-medium text-foreground" htmlFor="rec-domain">
            Область
          </Label>
          <ReferenceSelect
            id="rec-domain"
            name="domain"
            prefetchedItems={RECOMMENDATION_DOMAIN_ITEMS}
            valueMatch="code"
            submitField="code"
            value={values.domainCode}
            onChange={(code, _label) => {
              setValues((v) => ({ ...v, domainCode: code }));
            }}
            placeholder="Выберите область"
            clearOptionLabel="Без области"
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
          <MarkdownEditorToastUi
            key={`rec-body-${recordKey}`}
            name="bodyMd"
            defaultValue={values.bodyMd}
            label={<span className="text-sm font-medium text-foreground">Описание</span>}
            helpText={null}
            onValueChange={(md) => setValues((v) => ({ ...v, bodyMd: md }))}
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
        <div className="border-t border-border/60 pt-4">
          <div className="mb-3 rounded-md border border-border/60 bg-muted/20 p-3">
            <p className="text-sm font-medium text-foreground">Где используется</p>
            {usageBusy ? (
              <p className="mt-1 text-sm text-muted-foreground">Загрузка…</p>
            ) : usageLoadError ? (
              <p className="mt-1 text-sm text-muted-foreground">{usageLoadError}</p>
            ) : !usage ? null : !recommendationUsageHasAnyReference(usage) ? (
              <p className="mt-1 text-sm text-muted-foreground">Пока не используется</p>
            ) : (
              <RecommendationUsageSectionsView sections={usageSections} />
            )}
          </div>

          {archiveError ? (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {archiveError}
            </p>
          ) : null}

          <form ref={archiveFormRef} action={archiveFormAction} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={recommendation.id} />
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
            {workspaceListPreserve?.domain != null ? (
              <input type="hidden" name="listDomain" value={workspaceListPreserve.domain} />
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
                <DialogTitle>Рекомендация уже используется</DialogTitle>
                <div className="space-y-2 text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground">
                  <span className="block">
                    Архивация уберёт рекомендацию из каталога для новых программ. Уже выданные программы не удаляются.
                  </span>
                  {!warnSections.length &&
                  archiveState?.ok === false &&
                  "code" in archiveState &&
                  archiveState.code === "USAGE_CONFIRMATION_REQUIRED" &&
                  !recommendationUsageHasAnyReference(archiveState.usage) ? (
                    <span className="block text-sm">
                      Рекомендация помечена как используемая — проверьте связи перед архивацией.
                    </span>
                  ) : warnSections.length ? (
                    <RecommendationUsageSectionsView sections={warnSections} />
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
