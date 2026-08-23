'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/shared/ui/doctor/primitives/badge';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Checkbox } from '@/shared/ui/doctor/primitives/checkbox';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import {
  type ContentSectionKind,
  type SystemParentCode,
  isHelpSectionSlug,
  isImmutableSystemSectionSlug,
  isSectionSlugProtectedFromDelete,
  isSystemParentCode,
  placementFromTaxonomy,
} from '@/modules/content-sections/types';
import type { PatientHomeCmsReturnQuery } from '@/modules/patient-home/patientHomeCmsReturnUrls';
import { fallbackSlug, slugFromTitle } from '@/shared/lib/slugify';
import { MediaLibraryPickerDialog } from '../MediaLibraryPickerDialog';
import { saveContentSection, type SaveContentSectionState } from './actions';
import { SectionDeleteDialog } from './SectionDeleteDialog';
import { SectionSlugRenameDialog } from './SectionSlugRenameDialog';

const FOLDER_LABELS: Record<SystemParentCode, string> = {
  situations: 'Ситуации',
  sos: 'SOS',
  warmups: 'Разминки',
  lessons: 'Уроки',
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

function placementSummary(
  kind: ContentSectionKind,
  systemParentCode: SystemParentCode | null,
  sectionSlug?: string,
): string {
  if (sectionSlug && isHelpSectionSlug(sectionSlug)) return 'Справка (/help)';
  if (kind === 'article') return 'Статьи (общий каталог)';
  if (systemParentCode && isSystemParentCode(systemParentCode))
    return `Папка «${FOLDER_LABELS[systemParentCode]}»`;
  return 'Встроенный системный раздел (корень приложения)';
}

export function SectionForm({
  section,
  initialSuggestedSlug,
  initialSystemParentCode,
  pagesInSection = 0,
  patientHomeContext,
  onSaved,
}: {
  section?: SectionRow;
  /** Из query `?suggestedSlug=` при создании раздела (латиница, цифры, дефис). */
  initialSuggestedSlug?: string | null;
  /** Из query `?systemParentCode=` — предвыбор папки CMS при создании. */
  initialSystemParentCode?: string | null;
  pagesInSection?: number;
  patientHomeContext?: PatientHomeCmsReturnQuery;
  onSaved?: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    saveContentSection,
    null as SaveContentSectionState | null,
  );
  const isEdit = Boolean(section);
  const initialCreateSlug =
    !isEdit && initialSuggestedSlug != null && initialSuggestedSlug.trim() !== ''
      ? (() => {
          const raw = initialSuggestedSlug.trim().toLowerCase();
          if (!/^[a-z0-9-]+$/.test(raw) || /^-+$/.test(raw)) return '';
          return raw;
        })()
      : '';
  const [titleValue, setTitleValue] = useState(section?.title ?? '');
  const [slugValue, setSlugValue] = useState(initialCreateSlug);
  const [coverImageUrlValue, setCoverImageUrlValue] = useState(section?.coverImageUrl ?? '');
  const [iconImageUrlValue, setIconImageUrlValue] = useState(section?.iconImageUrl ?? '');
  const slugManualRef = useRef(initialCreateSlug.length > 0);

  useEffect(() => {
    if (state?.ok) onSaved?.();
  }, [onSaved, state?.ok]);

  const placementLocked =
    isEdit &&
    section != null &&
    (isImmutableSystemSectionSlug(section.slug) || isSectionSlugProtectedFromDelete(section.slug));

  const defaultCreatePlacement = useMemo(() => {
    const raw = initialSystemParentCode?.trim() ?? '';
    if (raw && isSystemParentCode(raw)) return raw;
    return 'article';
  }, [initialSystemParentCode]);

  const editPlacementValue =
    section != null ? placementFromTaxonomy(section.kind, section.systemParentCode) : 'article';

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? (
        <p role="alert" className="text-destructive">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        patientHomeContext ? (
          <div
            role="status"
            className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm"
          >
            <p className="font-medium">Раздел сохранён</p>
            <p className="mt-1 text-muted-foreground">
              Вернитесь на экран главной пациента и добавьте раздел в блок «
              {patientHomeContext.patientHomeBlock}».
            </p>
            <Link
              href={patientHomeContext.returnTo}
              className="mt-2 inline-flex text-primary underline"
            >
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
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Slug
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="slug" value={section!.slug} />
            <Input
              type="text"
              value={section!.slug}
              disabled
              readOnly
              className="min-w-[12rem] flex-1"
            />
            <SectionSlugRenameDialog
              oldSlug={section!.slug}
              pagesAffectedCount={pagesInSection}
              disabled={isSectionSlugProtectedFromDelete(section!.slug)}
              disabledReason="Slug этого раздела нельзя изменить."
            />
          </div>
        </div>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Заголовок
        </span>
        {isEdit ? (
          <Input
            type="text"
            name="title"
            required
            defaultValue={section?.title ?? ''}
            key={`title-${section?.slug ?? 'new'}`}
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
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Slug
          </span>
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
              pattern="[a-z0-9\-]+"
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
            <p className="text-sm text-muted-foreground">
              {placementSummary(section.kind, section.systemParentCode, section.slug)}
            </p>
          </>
        ) : isEdit && section ? (
          <Select
            name="placement"
            defaultValue={editPlacementValue}
            key={`placement-${section.slug}`}
          >
            <SelectTrigger className="w-full max-w-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="article">Статьи (общий каталог)</SelectItem>
              <SelectItem value="situations">Ситуации</SelectItem>
              <SelectItem value="sos">SOS</SelectItem>
              <SelectItem value="warmups">Разминки</SelectItem>
              <SelectItem value="lessons">Уроки</SelectItem>
              {editPlacementValue === 'system_root' ? (
                <SelectItem value="system_root">Встроенный (корень)</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        ) : (
          <Select
            name="placement"
            defaultValue={defaultCreatePlacement}
            key={`placement-new-${defaultCreatePlacement}`}
          >
            <SelectTrigger className="w-full max-w-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="article">Статьи (общий каталог)</SelectItem>
              <SelectItem value="situations">Ситуации</SelectItem>
              <SelectItem value="sos">SOS</SelectItem>
              <SelectItem value="warmups">Разминки</SelectItem>
              <SelectItem value="lessons">Уроки</SelectItem>
            </SelectContent>
          </Select>
        )}
        {!placementLocked ? (
          <p className="text-xs text-muted-foreground">
            Разделы в папках «Ситуации», «SOS», «Разминки» и «Уроки» не попадают в список всех
            статей; статьи остаются в общем каталоге.
          </p>
        ) : null}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Описание
        </span>
        <Textarea
          name="description"
          rows={2}
          defaultValue={section?.description ?? ''}
          key={`desc-${section?.slug ?? 'new'}`}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Порядок сортировки
        </span>
        <Input
          type="number"
          name="sort_order"
          defaultValue={section?.sortOrder ?? 0}
          key={`sort-${section?.slug ?? 'new'}`}
        />
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Обложка раздела
        </span>
        <input type="hidden" name="cover_image_url" value={coverImageUrlValue} />
        <MediaLibraryPickerDialog
          kind="image"
          value={coverImageUrlValue}
          onChange={setCoverImageUrlValue}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Иконка раздела
        </span>
        <input type="hidden" name="icon_image_url" value={iconImageUrlValue} />
        <MediaLibraryPickerDialog
          kind="image"
          value={iconImageUrlValue}
          onChange={setIconImageUrlValue}
        />
      </div>

      <label className="flex items-center gap-2">
        <Checkbox
          name="is_visible"
          defaultChecked={section?.isVisible ?? true}
          key={`vis-${section?.slug ?? 'new'}`}
        />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Виден пациентам
        </span>
      </label>

      <label className="flex items-center gap-2">
        <Checkbox
          name="requires_auth"
          defaultChecked={section?.requiresAuth ?? false}
          key={`req-${section?.slug ?? 'new'}`}
        />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Только для залогиненных (щит)
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Сохранение…' : 'Сохранить'}
        </Button>
        {isEdit && section != null && !isSectionSlugProtectedFromDelete(section.slug) ? (
          <SectionDeleteDialog
            sectionSlug={section.slug}
            sectionTitle={section.title}
            pagesInSection={pagesInSection}
          />
        ) : null}
      </div>
    </form>
  );
}
