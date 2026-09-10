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
import { apiJson } from '@/app/app/settings/bookingSoloAdminApi';
import { useDoctorPatientTerms } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';

const BASE = '/api/admin/booking-engine';

type SpecialistRow = {
  id: string;
  fullName: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
};

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
  const { patientGenitive } = useDoctorPatientTerms();
  const [specialists, setSpecialists] = useState<SpecialistRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [description, setDescription] = useState('');
  const [editedSpecialist, setEditedSpecialist] = useState<SpecialistRow | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editDescription, setEditDescription] = useState('');
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
    setEditFullName(loaded.fullName);
    setEditDescription(loaded.description ?? '');
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

  function resetCreateForm() {
    setFullName('');
    setDescription('');
  }

  function createSpecialist() {
    if (!fullName.trim()) return;
    run(
      async () => {
        const maxOrder = specialists.reduce(
          (current, specialist) => Math.max(current, specialist.sortOrder),
          0,
        );
        await apiJson(`${BASE}/specialists`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: fullName.trim(),
            description: description.trim() || null,
            sortOrder: maxOrder + 10,
          }),
        });
      },
      () => {
        resetCreateForm();
        setCreateOpen(false);
      },
    );
  }

  function openSpecialist(specialist: SpecialistRow) {
    setActionError(null);
    setEditedSpecialist(specialist);
    setEditFullName(specialist.fullName);
    setEditDescription(specialist.description ?? '');
  }

  function saveEditedSpecialist() {
    if (!editedSpecialist || !editFullName.trim()) return;
    run(
      () =>
        apiJson(`${BASE}/specialists/${editedSpecialist.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: editFullName.trim(),
            description: editDescription.trim() || null,
          }),
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
    const name = editFullName.trim();
    if (!name) return;
    const body = JSON.stringify({ fullName: name, description: editDescription.trim() || null });
    run(() =>
      soloSpecialist
        ? apiJson(`${BASE}/specialists/${soloSpecialist.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body,
          })
        : apiJson(`${BASE}/specialists`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fullName: name,
              description: editDescription.trim() || null,
              sortOrder: 10,
            }),
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

        <div className="flex flex-col gap-1">
          <Label htmlFor="specialist-solo-name">ФИО</Label>
          <Input
            id="specialist-solo-name"
            value={editFullName}
            onChange={(event) => setEditFullName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="specialist-solo-description">Описание для {patientGenitive}</Label>
          <Textarea
            id="specialist-solo-description"
            rows={4}
            className="min-h-24 resize-y"
            value={editDescription}
            onChange={(event) => setEditDescription(event.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Это имя и описание видят при онлайн-записи.
          </p>
        </div>
        <div>
          <Button
            type="button"
            size="sm"
            disabled={pending || !editFullName.trim()}
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
        fullName={fullName}
        description={description}
        error={actionError}
        onFullNameChange={setFullName}
        onDescriptionChange={setDescription}
        onClose={() => setCreateOpen(false)}
        onSubmit={createSpecialist}
      />

      <SpecialistModal
        mode="edit"
        open={editedSpecialist !== null}
        pending={pending}
        fullName={editFullName}
        description={editDescription}
        error={actionError}
        onFullNameChange={setEditFullName}
        onDescriptionChange={setEditDescription}
        onClose={() => setEditedSpecialist(null)}
        onSubmit={saveEditedSpecialist}
      />
    </>
  );
}

function SpecialistModal({
  mode,
  open,
  pending,
  fullName,
  description,
  error,
  onFullNameChange,
  onDescriptionChange,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  open: boolean;
  pending: boolean;
  fullName: string;
  description: string;
  error: string | null;
  onFullNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { patientGenitive } = useDoctorPatientTerms();
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
          <Button type="button" size="sm" disabled={pending || !fullName.trim()} onClick={onSubmit}>
            {mode === 'create' ? 'Создать' : 'Сохранить'}
          </Button>
        </>
      }
    >
      <div className="flex min-h-0 flex-col gap-3">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${prefix}-name`}>ФИО</Label>
          <Input
            id={`${prefix}-name`}
            value={fullName}
            onChange={(event) => onFullNameChange(event.target.value)}
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1">
          <Label htmlFor={`${prefix}-description`}>Описание для {patientGenitive}</Label>
          <Textarea
            id={`${prefix}-description`}
            rows={4}
            className="min-h-24 flex-1 resize-y"
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
          />
        </div>
      </div>
    </DoctorModal>
  );
}
