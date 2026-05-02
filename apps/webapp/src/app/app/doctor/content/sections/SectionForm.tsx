"use client";

import Link from "next/link";
import { useActionState, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  type ContentSectionKind,
  type SystemParentCode,
  isImmutableSystemSectionSlug,
  isSystemParentCode,
  placementFromTaxonomy,
} from "@/modules/content-sections/types";
import type { PatientHomeCmsReturnQuery } from "@/modules/patient-home/patientHomeCmsReturnUrls";
import { fallbackSlug, slugFromTitle } from "@/shared/lib/slugify";
import { MediaLibraryPickerDialog } from "../MediaLibraryPickerDialog";
import { saveContentSection, type SaveContentSectionState } from "./actions";
import { SectionSlugRenameDialog } from "./SectionSlugRenameDialog";

const FOLDER_LABELS: Record<SystemParentCode, string> = {
  situations: "Ситуации",
  sos: "SOS",
  warmups: "Разминки",
  lessons: "Уроки",
};

type SectionRow = {
  slug: string;
  title: string;
  description: string;
  sortOrder: number;
  isVisible: boolean;
  requiresAuth: boolean;
  coverImageUrl: string | null;
  iconImageUrl: string | null;
  kind: ContentSectionKind;
  systemParentCode: SystemParentCode | null;
};

function placementSummary(kind: ContentSectionKind, systemParentCode: SystemParentCode | null): string {
  if (kind === "article") return "Статьи (общий каталог)";
  if (systemParentCode && isSystemParentCode(systemParentCode)) return `Папка «${FOLDER_LABELS[systemParentCode]}»`;
  return "Встроенный системный раздел (корень приложения)";
}

export function SectionForm({
  section,
  initialSuggestedSlug,
  initialSystemParentCode,
  pagesInSection = 0,
  patientHomeContext,
}: {
  section?: SectionRow;
  /** Из query `?suggestedSlug=` при создании раздела (латиница, цифры, дефис). */
  initialSuggestedSlug?: string | null;
  /** Из query `?systemParentCode=` — предвыбор папки CMS при создании. */
  initialSystemParentCode?: string | null;
  pagesInSection?: number;
  patientHomeContext?: PatientHomeCmsReturnQuery;
}) {
  const [state, formAction, pending] = useActionState(saveContentSection, null as SaveContentSectionState | null);
  const isEdit = Boolean(section);
  const initialCreateSlug =
    !isEdit && initialSuggestedSlug != null && initialSuggestedSlug.trim() !== ""
      ? (() => {
          const raw = initialSuggestedSlug.trim().toLowerCase();
          if (!/^[a-z0-9-]+$/.test(raw) || /^-+$/.test(raw)) return "";
          return raw;
        })()
      : "";
  const [titleValue, setTitleValue] = useState(section?.title ?? "");
  const [slugValue, setSlugValue] = useState(initialCreateSlug);
  const [coverImageUrlValue, setCoverImageUrlValue] = useState(section?.coverImageUrl ?? "");
  const [iconImageUrlValue, setIconImageUrlValue] = useState(section?.iconImageUrl ?? "");
  const slugManualRef = useRef(initialCreateSlug.length > 0);

  const placementLocked = isEdit && section != null && isImmutableSystemSectionSlug(section.slug);

  const defaultCreatePlacement = useMemo(() => {
    const raw = initialSystemParentCode?.trim() ?? "";
    if (raw && isSystemParentCode(raw)) return raw;
    return "article";
  }, [initialSystemParentCode]);

  const editPlacementValue =
    section != null ? placementFromTaxonomy(section.kind, section.systemParentCode) : "article";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? (
        <p role="alert" className="text-destructive">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        patientHomeContext ? (
          <div role="status" className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm">
            <p className="font-medium">Раздел сохранён</p>
            <p className="mt-1 text-muted-foreground">
              Вернитесь на экран главной пациента и добавьте раздел в блок «{patientHomeContext.patientHomeBlock}».
            </p>
            <Link href={patientHomeContext.returnTo} className="mt-2 inline-flex text-primary underline">
              Открыть экран «Главная пациента»
            </Link>
          </div>
        ) : (
          <p role="status" className="text-sm text-green-700">
            Сохранено
          </p>
        )
      ) : null}

      {isEdit ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Slug</span>
          <div className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="slug" value={section!.slug} />
            <Input type="text" value={section!.slug} disabled readOnly className="min-w-[12rem] flex-1" />
            <SectionSlugRenameDialog
              oldSlug={section!.slug}
              pagesAffectedCount={pagesInSection}
              disabled={isImmutableSystemSectionSlug(section!.slug)}
              disabledReason="Встроенные разделы приложения используются в пациентском интерфейсе; slug нельзя изменить."
            />
          </div>
        </div>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Заголовок</span>
        {isEdit ? (
          <Input
            type="text"
            name="title"
            required
            defaultValue={section?.title ?? ""}
            key={`title-${section?.slug ?? "new"}`}
          />
        ) : (
          <Input
            type="text"
            name="title"
            required
            value={titleValue}
            onChange={(e) => {
              const t = e.target.value;
              setTitleValue(t);
              if (!slugManualRef.current) {
                const s = slugFromTitle(t);
                setSlugValue(s ?? fallbackSlug());
              }
            }}
          />
        )}
      </label>

      {!isEdit ? (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Slug</span>
          <div className="flex flex-wrap gap-2">
            <Input
              type="text"
              name="slug"
              required
              className="min-w-[12rem] flex-1"
              value={slugValue}
              placeholder="например warmups"
              onChange={(e) => {
                slugManualRef.current = true;
                setSlugValue(e.target.value);
              }}
              pattern="[a-z0-9-]+"
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              onClick={() => {
                slugManualRef.current = false;
                const s = slugFromTitle(titleValue);
                setSlugValue(s ?? fallbackSlug());
              }}
            >
              Сгенерировать
            </Button>
          </div>
        </label>
      ) : null}

      <div className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/20 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Расположение в CMS
          </Label>
          {placementLocked ? (
            <Badge variant="secondary" className="text-[10px]">
              только чтение
            </Badge>
          ) : null}
        </div>
        {placementLocked && section ? (
          <>
            <input type="hidden" name="placement" value={editPlacementValue} />
            <p className="text-sm text-muted-foreground">{placementSummary(section.kind, section.systemParentCode)}</p>
          </>
        ) : isEdit && section ? (
          <select
            name="placement"
            className="h-10 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            defaultValue={editPlacementValue}
            key={`placement-${section.slug}`}
          >
            <option value="article">Статьи (общий каталог)</option>
            <option value="situations">Ситуации</option>
            <option value="sos">SOS</option>
            <option value="warmups">Разминки</option>
            <option value="lessons">Уроки</option>
            {editPlacementValue === "system_root" ? <option value="system_root">Встроенный (корень)</option> : null}
          </select>
        ) : (
          <select
            name="placement"
            className="h-10 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            defaultValue={defaultCreatePlacement}
            key={`placement-new-${defaultCreatePlacement}`}
          >
            <option value="article">Статьи (общий каталог)</option>
            <option value="situations">Ситуации</option>
            <option value="sos">SOS</option>
            <option value="warmups">Разминки</option>
            <option value="lessons">Уроки</option>
          </select>
        )}
        {!placementLocked ? (
          <p className="text-xs text-muted-foreground">
            Разделы в папках «Ситуации», «SOS», «Разминки» и «Уроки» не попадают в список всех статей; статьи остаются в
            общем каталоге.
          </p>
        ) : null}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Описание</span>
        <Textarea
          name="description"
          rows={2}
          defaultValue={section?.description ?? ""}
          key={`desc-${section?.slug ?? "new"}`}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Порядок сортировки</span>
        <Input
          type="number"
          name="sort_order"
          defaultValue={section?.sortOrder ?? 0}
          key={`sort-${section?.slug ?? "new"}`}
        />
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Обложка раздела</span>
        <input type="hidden" name="cover_image_url" value={coverImageUrlValue} />
        <MediaLibraryPickerDialog kind="image" value={coverImageUrlValue} onChange={setCoverImageUrlValue} />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Иконка раздела</span>
        <input type="hidden" name="icon_image_url" value={iconImageUrlValue} />
        <MediaLibraryPickerDialog kind="image" value={iconImageUrlValue} onChange={setIconImageUrlValue} />
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="is_visible"
          defaultChecked={section?.isVisible ?? true}
          key={`vis-${section?.slug ?? "new"}`}
        />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Виден пациентам</span>
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="requires_auth"
          defaultChecked={section?.requiresAuth ?? false}
          key={`req-${section?.slug ?? "new"}`}
        />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Только для залогиненных (щит)
        </span>
      </label>

      <Button type="submit" disabled={pending}>
        {pending ? "Сохранение…" : "Сохранить"}
      </Button>
    </form>
  );
}
