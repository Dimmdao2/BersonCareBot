"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PatientHomeCmsReturnQuery } from "@/modules/patient-home/patientHomeCmsReturnUrls";
import { cn } from "@/lib/utils";
import { fallbackSlug, slugFromTitle } from "@/shared/lib/slugify";
import { saveContentSection, type SaveContentSectionState } from "./actions";
import { SectionSlugRenameDialog } from "./SectionSlugRenameDialog";

type SectionRow = {
  slug: string;
  title: string;
  description: string;
  sortOrder: number;
  isVisible: boolean;
  requiresAuth: boolean;
  iconImageUrl?: string | null;
  coverImageUrl?: string | null;
};

export function SectionForm({
  section,
  pagesInSection = 0,
  patientHomeContext,
}: {
  section?: SectionRow;
  pagesInSection?: number;
  /** Query с экрана настройки блоков главной (Phase 5/6 FIX): после сохранения нового раздела — ссылка «вернуться». */
  patientHomeContext?: PatientHomeCmsReturnQuery | null;
}) {
  const [state, formAction, pending] = useActionState(saveContentSection, null as SaveContentSectionState | null);
  const isEdit = Boolean(section);
  const [titleValue, setTitleValue] = useState(section?.title ?? "");
  const [slugValue, setSlugValue] = useState("");
  const slugManualRef = useRef(false);

  return (
    <>
      <form action={formAction} className="flex flex-col gap-4">
        {state && !state.ok && "error" in state ? (
          <p role="alert" className="text-destructive">
            {state.error}
          </p>
        ) : null}
        {state?.ok === true && patientHomeContext ? (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <p className="font-medium text-foreground">Раздел сохранён</p>
            <p className="mt-1 text-muted-foreground">
              Вернитесь к настройке блока и добавьте раздел{" "}
              <span className="font-mono">{state.savedSlug}</span> в блок «{patientHomeContext.patientHomeBlock}» через
              «Настроить».
            </p>
            <Link
              href={patientHomeContext.returnTo}
              className={cn(buttonVariants({ variant: "secondary" }), "mt-3 inline-flex")}
            >
              Открыть экран «Главная пациента»
            </Link>
          </div>
        ) : null}
        {state?.ok === true && !patientHomeContext ? (
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
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          URL иконки (опционально)
        </span>
        <Input
          type="text"
          name="icon_image_url"
          defaultValue={section?.iconImageUrl ?? ""}
          placeholder="/api/media/… или https://…"
          key={`icon-${section?.slug ?? "new"}`}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          URL обложки (опционально)
        </span>
        <Input
          type="text"
          name="cover_image_url"
          defaultValue={section?.coverImageUrl ?? ""}
          placeholder="/api/media/… или https://…"
          key={`cover-${section?.slug ?? "new"}`}
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
    {isEdit ? (
      <SectionSlugRenameDialog oldSlug={section!.slug} pagesAffectedCount={pagesInSection} />
    ) : null}
    </>
  );
}
