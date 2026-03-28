"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fallbackSlug, slugFromTitle } from "@/shared/lib/slugify";
import { saveContentSection, type SaveContentSectionState } from "./actions";

type SectionRow = {
  slug: string;
  title: string;
  description: string;
  sortOrder: number;
  isVisible: boolean;
};

export function SectionForm({ section }: { section?: SectionRow }) {
  const [state, formAction, pending] = useActionState(saveContentSection, null as SaveContentSectionState | null);
  const isEdit = Boolean(section);
  const [titleValue, setTitleValue] = useState(section?.title ?? "");
  const [slugValue, setSlugValue] = useState("");
  const slugManualRef = useRef(false);

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

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="is_visible"
          defaultChecked={section?.isVisible ?? true}
          key={`vis-${section?.slug ?? "new"}`}
        />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Виден пациентам</span>
      </label>

      <Button type="submit" disabled={pending}>
        {pending ? "Сохранение…" : "Сохранить"}
      </Button>
    </form>
  );
}
