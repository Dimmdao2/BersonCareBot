'use client';

import { useCallback, useEffect, useId, useState, useTransition } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Checkbox } from '@/shared/ui/doctor/primitives/checkbox';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import {
  DoctorDnaFlatList,
  doctorDnaFlatListPrimaryClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { DoctorSortableSettingsRow } from '@/shared/ui/doctor/DoctorSortableSettingsRow';
import { MarkdownEditor } from '@/shared/ui/doctor/markdown/MarkdownEditor';
import { MediaPickerShell } from '@/shared/ui/doctor/media/MediaPickerShell';
import { MediaPickerPanel } from '@/shared/ui/doctor/media/MediaPickerPanel';
import type { MediaListItem } from '@/shared/ui/doctor/media/MediaPickerList';
import { apiJson } from '@/app/app/settings/bookingSoloAdminApi';

const BASE = '/api/admin/booking-engine';

type SpecialistRow = {
  id: string;
  fullName: string;
  description: string | null;
  avatarMediaId: string | null;
  fullDescriptionMarkdown: string | null;
  cardIsPublished: boolean;
  isActive: boolean;
  sortOrder: number;
};

/**
 * Что клиника задаёт человеку (#926 §17.H, решение владельца 11.09): «короткое описание это просто
 * текст, а подробное описание это markdown материал с возможностью вставки медиа», плюс
 * «аватар-специалист обязательно нужно».
 */
type SpecialistDraft = {
  fullName: string;
  description: string;
  avatarMediaId: string | null;
  fullDescriptionMarkdown: string;
  cardIsPublished: boolean;
};

const EMPTY_DRAFT: SpecialistDraft = {
  fullName: '',
  description: '',
  avatarMediaId: null,
  fullDescriptionMarkdown: '',
  cardIsPublished: false,
};

function draftOf(specialist: SpecialistRow): SpecialistDraft {
  return {
    fullName: specialist.fullName,
    description: specialist.description ?? '',
    avatarMediaId: specialist.avatarMediaId,
    fullDescriptionMarkdown: specialist.fullDescriptionMarkdown ?? '',
    cardIsPublished: specialist.cardIsPublished,
  };
}

/** Тело запроса на запись. Пустая строка означает «поля нет», а не пустой текст. */
function draftBody(draft: SpecialistDraft): Record<string, unknown> {
  return {
    fullName: draft.fullName.trim(),
    description: draft.description.trim() || null,
    avatarMediaId: draft.avatarMediaId,
    fullDescriptionMarkdown: draft.fullDescriptionMarkdown.trim() || null,
    cardIsPublished: draft.cardIsPublished,
  };
}

/**
 * Owner ruling 2026-09-10: a solo tariff has exactly one specialist, so its own settings tab must
 * open that profile straight away — a catalogue list with «Добавить специалиста» offers a second
 * specialist the tariff has no place for. Clinic management keeps the list; both variants drive the
 * same `/api/admin/booking-engine/specialists` writer, there is no second implementation.
 */
export function BookingSoloSpecialistsSection({
  variant = 'list',
}: {
  variant?: 'list' | 'solo-profile';
} = {}) {
  const [specialists, setSpecialists] = useState<SpecialistRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<SpecialistDraft>(EMPTY_DRAFT);
  const [editedSpecialist, setEditedSpecialist] = useState<SpecialistRow | null>(null);
  const [editDraft, setEditDraft] = useState<SpecialistDraft>(EMPTY_DRAFT);
  const dndContextId = useId();
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const json = await apiJson<{ ok: boolean; specialists: SpecialistRow[] }>(
        `${BASE}/specialists`,
      );
      setSpecialists(
        [...json.specialists].sort(
          (left, right) =>
            left.sortOrder - right.sortOrder || left.fullName.localeCompare(right.fullName, 'ru'),
        ),
      );
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'load_failed');
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  // The solo profile edits the single loaded specialist in place; seeding is keyed on its id so a
  // background reload never overwrites what the owner is typing.
  const soloSpecialist = specialists.length === 1 ? specialists[0] : null;
  const soloSpecialistId = soloSpecialist?.id ?? null;
  useEffect(() => {
    if (variant !== 'solo-profile' || soloSpecialistId === null) return;
    const loaded = specialists.find((specialist) => specialist.id === soloSpecialistId);
    if (!loaded) return;
    setEditDraft(draftOf(loaded));
    // `specialists` is intentionally out of the dependency list: only a changed identity reseeds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, soloSpecialistId]);

  function run(task: () => Promise<unknown>, onSuccess?: () => void) {
    setActionError(null);
    startTransition(async () => {
      try {
        await task();
        await load();
        onSuccess?.();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : 'action_failed');
      }
    });
  }

  function createSpecialist() {
    if (!createDraft.fullName.trim()) return;
    run(
      async () => {
        const maxOrder = specialists.reduce(
          (current, specialist) => Math.max(current, specialist.sortOrder),
          0,
        );
        await apiJson(`${BASE}/specialists`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...draftBody(createDraft), sortOrder: maxOrder + 10 }),
        });
      },
      () => {
        setCreateDraft(EMPTY_DRAFT);
        setCreateOpen(false);
      },
    );
  }

  function openSpecialist(specialist: SpecialistRow) {
    setActionError(null);
    setEditedSpecialist(specialist);
    setEditDraft(draftOf(specialist));
  }

  function saveEditedSpecialist() {
    if (!editedSpecialist || !editDraft.fullName.trim()) return;
    run(
      () =>
        apiJson(`${BASE}/specialists/${editedSpecialist.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draftBody(editDraft)),
        }),
      () => setEditedSpecialist(null),
    );
  }

  function setSpecialistActive(specialist: SpecialistRow, isActive: boolean) {
    run(() =>
      apiJson(`${BASE}/specialists/${specialist.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      }),
    );
  }

  function saveSoloProfile() {
    if (!editDraft.fullName.trim()) return;
    const body = draftBody(editDraft);
    run(() =>
      soloSpecialist
        ? apiJson(`${BASE}/specialists/${soloSpecialist.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : apiJson(`${BASE}/specialists`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, sortOrder: 10 }),
          }),
    );
  }

  function reorderSpecialists(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = specialists.findIndex((specialist) => specialist.id === active.id);
    const newIndex = specialists.findIndex((specialist) => specialist.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(specialists, oldIndex, newIndex).map((specialist, index) => ({
      ...specialist,
      sortOrder: (index + 1) * 10,
    }));
    setSpecialists(reordered);
    setActionError(null);
    startTransition(async () => {
      try {
        await Promise.all(
          reordered.map((specialist) =>
            apiJson(`${BASE}/specialists/${specialist.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sortOrder: specialist.sortOrder }),
            }),
          ),
        );
        await load();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : 'action_failed');
        await load();
      }
    });
  }

  if (variant === 'solo-profile' && specialists.length <= 1) {
    return (
      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Профиль специалиста</DoctorSectionTitle>
        </DoctorSectionHeader>

        {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
        {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}

        <SpecialistProfileFields
          idPrefix="specialist-solo"
          draft={editDraft}
          onChange={(next) => setEditDraft((current) => ({ ...current, ...next }))}
          disabled={pending}
          shortDescriptionHint="Это имя и описание видят при онлайн-записи."
        />
        <div>
          <Button
            type="button"
            size="sm"
            disabled={pending || !editDraft.fullName.trim()}
            onClick={saveSoloProfile}
          >
            Сохранить
          </Button>
        </div>
      </DoctorSection>
    );
  }

  return (
    <>
      <DoctorSection>
        <DoctorSectionHeader className="flex-row items-center justify-between gap-3">
          <DoctorSectionTitle>Специалисты</DoctorSectionTitle>
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => {
              setActionError(null);
              setCreateOpen(true);
            }}
          >
            Добавить специалиста
          </Button>
        </DoctorSectionHeader>

        {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
        {actionError && !createOpen && !editedSpecialist ? (
          <p className="text-sm text-destructive">{actionError}</p>
        ) : null}

        <DndContext
          id={dndContextId}
          sensors={dndSensors}
          collisionDetection={closestCenter}
          onDragEnd={reorderSpecialists}
        >
          <SortableContext
            items={specialists.map((specialist) => specialist.id)}
            strategy={verticalListSortingStrategy}
            disabled={pending}
          >
            <DoctorDnaFlatList aria-label="Специалисты">
              {specialists.map((specialist) => (
                <DoctorSortableSettingsRow
                  key={specialist.id}
                  id={specialist.id}
                  label={specialist.fullName}
                  disabled={pending}
                  active={specialist.isActive}
                  onOpen={() => openSpecialist(specialist)}
                  onActiveChange={(checked) => setSpecialistActive(specialist, checked)}
                >
                  <span
                    className={`${doctorDnaFlatListPrimaryClass} block truncate ${!specialist.isActive ? 'text-muted-foreground line-through' : ''}`}
                  >
                    {specialist.fullName}
                  </span>
                </DoctorSortableSettingsRow>
              ))}
            </DoctorDnaFlatList>
          </SortableContext>
        </DndContext>

        {specialists.length === 0 ? (
          <p className="text-sm text-muted-foreground">Специалистов пока нет.</p>
        ) : null}
      </DoctorSection>

      <SpecialistModal
        mode="create"
        open={createOpen}
        pending={pending}
        draft={createDraft}
        error={actionError}
        onChange={(next) => setCreateDraft((current) => ({ ...current, ...next }))}
        onClose={() => setCreateOpen(false)}
        onSubmit={createSpecialist}
      />

      <SpecialistModal
        mode="edit"
        open={editedSpecialist !== null}
        pending={pending}
        draft={editDraft}
        error={actionError}
        onChange={(next) => setEditDraft((current) => ({ ...current, ...next }))}
        onClose={() => setEditedSpecialist(null)}
        onSubmit={saveEditedSpecialist}
      />
    </>
  );
}

/**
 * Поля профиля специалиста — ОДИН блок на оба места: модалку списка клиники и профиль соло-тарифа.
 * Две копии этой формы разошлись бы при первой же правке одной из них.
 *
 * Пикер медиа — тот же `MediaPickerShell`/`MediaPickerPanel`, что у визитки клиники (§20), а
 * подробное описание — тот же `MarkdownEditor`, что стоит в семи местах кабинета: второго
 * редактора и второго пикера здесь не заводится (§5).
 */
function SpecialistProfileFields({
  idPrefix,
  draft,
  onChange,
  disabled,
  shortDescriptionHint,
}: {
  idPrefix: string;
  draft: SpecialistDraft;
  onChange: (next: Partial<SpecialistDraft>) => void;
  disabled: boolean;
  shortDescriptionHint?: string;
}) {
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idPrefix}-name`}>ФИО</Label>
        <Input
          id={`${idPrefix}-name`}
          value={draft.fullName}
          disabled={disabled}
          onChange={(event) => onChange({ fullName: event.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label>Фотография</Label>
        <div className="flex flex-wrap items-center gap-2">
          {draft.avatarMediaId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/media/${draft.avatarMediaId}`}
              alt=""
              className="size-12 rounded-full object-cover"
            />
          ) : (
            <div aria-hidden className="size-12 rounded-full border border-border/60 bg-muted/30" />
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => setAvatarPickerOpen(true)}
          >
            Установить
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || !draft.avatarMediaId}
            onClick={() => onChange({ avatarMediaId: null })}
          >
            Очистить
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idPrefix}-description`}>Короткое описание</Label>
        <Textarea
          id={`${idPrefix}-description`}
          rows={3}
          className="min-h-20 resize-y"
          value={draft.description}
          disabled={disabled}
          onChange={(event) => onChange({ description: event.target.value })}
        />
        {shortDescriptionHint ? (
          <p className="text-sm text-muted-foreground">{shortDescriptionHint}</p>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-col gap-1">
        <MarkdownEditor
          name={`${idPrefix}-full-description`}
          label="Подробное описание"
          helpText={null}
          value={draft.fullDescriptionMarkdown}
          disabled={disabled}
          minHeight={180}
          onChange={(value) => onChange({ fullDescriptionMarkdown: value })}
        />
      </div>

      <label className="flex items-start gap-2 text-sm" htmlFor={`${idPrefix}-published`}>
        <Checkbox
          id={`${idPrefix}-published`}
          checked={draft.cardIsPublished}
          disabled={disabled}
          onCheckedChange={(checked) => onChange({ cardIsPublished: checked === true })}
          className="mt-0.5"
        />
        <span>Показывать страницу специалиста</span>
      </label>

      <MediaPickerShell
        title="Фотография специалиста"
        open={avatarPickerOpen}
        onOpenChange={setAvatarPickerOpen}
      >
        <MediaPickerPanel
          key={avatarPickerOpen ? 'specialist-avatar-open' : 'specialist-avatar-closed'}
          open={avatarPickerOpen}
          apiKind="image"
          kind="image"
          folderId={undefined}
          onPick={(item: MediaListItem) => {
            onChange({ avatarMediaId: item.id });
            setAvatarPickerOpen(false);
          }}
          exercisePicker={false}
          onPickerFolderIdChange={() => {}}
          showSort={false}
          showFolderScope={false}
        />
      </MediaPickerShell>
    </div>
  );
}

function SpecialistModal({
  mode,
  open,
  pending,
  draft,
  error,
  onChange,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  open: boolean;
  pending: boolean;
  draft: SpecialistDraft;
  error: string | null;
  onChange: (next: Partial<SpecialistDraft>) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const prefix = mode === 'create' ? 'specialist-create' : 'specialist-edit';
  return (
    <DoctorModal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Новый специалист' : 'Редактировать специалиста'}
      size="md"
      footer={
        <>
          <Button type="button" size="sm" variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending || !draft.fullName.trim()}
            onClick={onSubmit}
          >
            {mode === 'create' ? 'Создать' : 'Сохранить'}
          </Button>
        </>
      }
    >
      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
      <SpecialistProfileFields
        idPrefix={prefix}
        draft={draft}
        onChange={onChange}
        disabled={pending}
      />
    </DoctorModal>
  );
}
