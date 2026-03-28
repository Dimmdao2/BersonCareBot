"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Slug</span>
        {isEdit ? (
          <>
            <input type="hidden" name="slug" value={section!.slug} />
            <Input type="text" value={section!.slug} disabled readOnly />
          </>
        ) : (
          <Input
            type="text"
            name="slug"
            required
            pattern="[a-z0-9-]+"
            placeholder="например warmups"
            key="slug-new"
          />
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Заголовок</span>
        <Input
          type="text"
          name="title"
          required
          defaultValue={section?.title ?? ""}
          key={`title-${section?.slug ?? "new"}`}
        />
      </label>

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
