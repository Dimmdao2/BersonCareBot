"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fallbackSlug, slugFromTitle } from "@/shared/lib/slugify";
import { MediaLibraryPickerDialog } from "../MediaLibraryPickerDialog";
import { saveContentSection, type SaveContentSectionState } from "./actions";

type SectionRow = {
  slug: string;
  title: string;
  description: string;
  sortOrder: number;
  isVisible: boolean;
  requiresAuth: boolean;
  coverImageUrl: string | null;
  iconImageUrl: string | null;
};

export function SectionForm({
  section,
  initialSuggestedSlug,
}: {
  section?: SectionRow;
  /** Из query `?suggestedSlug=` при создании раздела (латиница, цифры, дефис). */
  initialSuggestedSlug?: string | null;
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

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? (
        <p role="alert" className="text-destructive">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p role="status" className="text-sm text-green-700">
          Сохранено
        </p>
      ) : null}

      {isEdit ? (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Slug</span>
          <>
            <input type="hidden" name="slug" value={section!.slug} />
            <Input type="text" value={section!.slug} disabled readOnly />
          </>
        </label>
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
