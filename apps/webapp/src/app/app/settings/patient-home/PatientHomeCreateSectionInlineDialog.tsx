"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MediaLibraryPickerDialog } from "@/app/app/doctor/content/MediaLibraryPickerDialog";
import { getPatientHomeBlockEditorMetadata } from "@/modules/patient-home/blockEditorMetadata";
import type { PatientHomeBlockCode } from "@/modules/patient-home/ports";
import { fallbackSlug, slugFromTitle } from "@/shared/lib/slugify";
import { createContentSectionForPatientHomeBlock } from "./actions";

export function PatientHomeCreateSectionInlineDialog({
  open,
  onOpenChange,
  blockCode,
  onSaved,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  blockCode: PatientHomeBlockCode;
  onSaved(): void;
}) {
  const meta = getPatientHomeBlockEditorMetadata(blockCode);
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

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setSlug("");
    slugManualRef.current = false;
    setDescription("");
    setSortOrder("0");
    setIsVisible(true);
    setRequiresAuth(false);
    setIconImageUrl("");
    setCoverImageUrl("");
    setError(null);
  }, [open]);

  const submit = () => {
    setError(null);
    const so = Number.parseInt(sortOrder, 10);
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
      onSaved();
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Новый раздел в блок «{meta.displayTitle}»</DialogTitle>
          <DialogDescription>
            Раздел сохраняется в CMS и сразу добавляется в этот блок главной пациента как видимый элемент.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-1">
          {error ? (
            <p role="alert" className="text-sm text-destructive" data-testid="ph-inline-section-error">
              {error}
            </p>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="ph-inline-sec-title">Заголовок</Label>
            <Input
              id="ph-inline-sec-title"
              data-testid="ph-inline-section-title"
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
                data-testid="ph-inline-section-slug"
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
                data-testid="ph-inline-section-slug-generate"
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
              data-testid="ph-inline-section-description"
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
              data-testid="ph-inline-section-sort"
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
              <p className="text-xs text-muted-foreground">Раздел в меню и навигации пациента.</p>
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
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Иконка раздела</span>
            <MediaLibraryPickerDialog kind="image" value={iconImageUrl} onChange={setIconImageUrl} />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Обложка раздела</span>
            <MediaLibraryPickerDialog kind="image" value={coverImageUrl} onChange={setCoverImageUrl} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Отмена
          </Button>
          <Button
            type="button"
            data-testid="ph-inline-section-submit"
            disabled={pending || !title.trim() || !slug.trim()}
            onClick={submit}
          >
            {pending ? "Создание…" : "Создать раздел и добавить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
