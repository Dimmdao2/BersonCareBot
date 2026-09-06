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

const BASE = '/api/admin/booking-engine';

type SpecialistRow = {
  id: string;
  fullName: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
};

export function BookingSoloSpecialistsSection() {
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
  const prefix = mode === 'create' ? 'specialist-create' : 'specialist-edit';
  return (
    <DoctorModal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Новый специалист' : 'Редактировать специалиста'}
      size="md"
      footer={
        <Button type="button" size="sm" disabled={pending || !fullName.trim()} onClick={onSubmit}>
          {mode === 'create' ? 'Создать' : 'Сохранить'}
        </Button>
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
          <Label htmlFor={`${prefix}-description`}>Описание для пациента</Label>
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
