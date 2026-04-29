"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { PatientHomeCmsBlockCode } from "@/modules/patient-home/blocks";
import { fallbackSlug, slugFromTitle } from "@/shared/lib/slugify";
import type { PatientHomeEditorItemRow } from "@/modules/patient-home/patientHomeEditorDemo";
import { createContentSectionForPatientHomeBlock } from "@/app/app/settings/patient-home/actions";

export type PatientHomeCreateSectionInlineFormProps = {
  blockCode: PatientHomeCmsBlockCode;
  onSuccess: (item: PatientHomeEditorItemRow) => void;
};

export function PatientHomeCreateSectionInlineForm({ blockCode, onSuccess }: PatientHomeCreateSectionInlineFormProps) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const slugManualRef = useRef(false);
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isVisible, setIsVisible] = useState(true);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [iconImageUrl, setIconImageUrl] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    const so = parseInt(sortOrder, 10);
    startTransition(async () => {
      const res = await createContentSectionForPatientHomeBlock({
        blockCode,
        title: title.trim(),
        slug: slug.trim(),
        description: description.trim(),
        sortOrder: Number.isFinite(so) ? so : 0,
        isVisible,
        requiresAuth,
        iconImageUrl: iconImageUrl.trim() || undefined,
        coverImageUrl: coverImageUrl.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSuccess(res.item);
      setTitle("");
      setSlug("");
      slugManualRef.current = false;
      setDescription("");
      setSortOrder("0");
      setIsVisible(true);
      setRequiresAuth(false);
      setIconImageUrl("");
      setCoverImageUrl("");
    });
  };

  return (
    <div className="rounded-md border border-dashed border-border p-3 text-sm" data-testid="patient-home-inline-create-section">
      <p className="mb-2 text-muted-foreground">Нет подходящих разделов в списке. Создайте раздел здесь — он появится в блоке.</p>
      <div className="flex flex-col gap-3">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="space-y-1">
          <Label htmlFor="ph-inline-sec-title">Заголовок</Label>
          <Input
            id="ph-inline-sec-title"
            value={title}
            required
            onChange={(e) => {
              const t = e.target.value;
              setTitle(t);
              if (!slugManualRef.current) {
                const s = slugFromTitle(t);
                setSlug(s ?? fallbackSlug());
              }
            }}
            placeholder="Например, Дом"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ph-inline-sec-slug">Slug</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="ph-inline-sec-slug"
              value={slug}
              className="min-w-[10rem] flex-1 font-mono text-xs"
              placeholder="например home"
              pattern="[a-z0-9-]+"
              onChange={(e) => {
                slugManualRef.current = true;
                setSlug(e.target.value);
              }}
              autoComplete="off"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => {
                slugManualRef.current = false;
                const s = slugFromTitle(title);
                setSlug(s ?? fallbackSlug());
              }}
            >
              Сгенерировать
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ph-inline-sec-desc">Описание</Label>
          <Textarea
            id="ph-inline-sec-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Необязательно"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ph-inline-sec-sort">Порядок сортировки</Label>
          <Input
            id="ph-inline-sec-sort"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
          <div>
            <Label htmlFor="ph-inline-sec-vis" className="text-sm">
              Виден пациентам
            </Label>
            <p className="text-xs text-muted-foreground">Секция в меню и навигации пациента.</p>
          </div>
          <Switch id="ph-inline-sec-vis" checked={isVisible} onCheckedChange={(v) => setIsVisible(Boolean(v))} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
          <div>
            <Label htmlFor="ph-inline-sec-auth" className="text-sm">
              Только для залогиненных
            </Label>
            <p className="text-xs text-muted-foreground">Требует авторизации пациента.</p>
          </div>
          <Switch id="ph-inline-sec-auth" checked={requiresAuth} onCheckedChange={(v) => setRequiresAuth(Boolean(v))} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ph-inline-sec-icon">Иконка (URL, необязательно)</Label>
          <Input
            id="ph-inline-sec-icon"
            value={iconImageUrl}
            onChange={(e) => setIconImageUrl(e.target.value)}
            placeholder="/api/media/… или https://…"
            className="font-mono text-xs"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ph-inline-sec-cover">Обложка (URL, необязательно)</Label>
          <Input
            id="ph-inline-sec-cover"
            value={coverImageUrl}
            onChange={(e) => setCoverImageUrl(e.target.value)}
            placeholder="/api/media/… или https://…"
            className="font-mono text-xs"
            autoComplete="off"
          />
        </div>
        <Button type="button" disabled={pending || !title.trim() || !slug.trim()} onClick={submit}>
          {pending ? "Создание…" : "Создать раздел и добавить в блок"}
        </Button>
        <p className="text-xs text-muted-foreground">
          URL иконки и обложки проверяются по политике медиа; в таблице `content_sections` пока нет колонок под эти
          поля — значения не сохраняются до отдельной миграции.
        </p>
      </div>
    </div>
  );
}
