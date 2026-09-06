'use client';

import { useCallback, useEffect, useId, useState, useTransition, type CSSProperties } from 'react';
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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import { Switch } from '@/shared/ui/doctor/primitives/switch';
import { Checkbox } from '@/shared/ui/doctor/primitives/checkbox';
import { DoctorColorPicker } from '@/shared/ui/doctor/DoctorColorPicker';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import {
  DoctorDnaFlatList,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import {
  SOLO_BOOKING_UNAVAILABLE_MESSAGE,
  apiJson,
  ensureDefaultSpecialist,
  fetchBookingDefaultId,
  fetchSoloOverview,
  setBookingDefaultId,
  setOnlineLocationEnabled,
  slugCityCode,
  type SoloOverview,
} from '@/app/app/settings/bookingSoloAdminApi';
import { isBuiltInOnlineLocation } from '@/modules/booking-engine/onlineLocation';
import { DEFAULT_BOOKING_LOCATION_PALETTE } from '@/modules/booking-engine/locationPalette';
import { DoctorTimezoneSelect } from '@/shared/ui/doctor/DoctorTimezoneSelect';
import { Flag, GripVertical } from 'lucide-react';

const BASE = '/api/admin/booking-engine';
const DEFAULT_BRANCH_COLOR = '#2563eb';

type BranchRow = SoloOverview['branches'][0];

function BranchMeta({ branch }: { branch: BranchRow }) {
  const color = branch.color ?? DEFAULT_BRANCH_COLOR;
  const shortLabel = branch.shortTitle?.trim() || '—';
  const addressLabel = branch.address?.trim() || '—';
  return (
    <span className={`${doctorDnaFlatListMetaClass} flex min-w-0 items-center gap-2`}>
      <span
        className="size-[18px] shrink-0 rounded-full border border-border"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span className="shrink-0">{shortLabel}</span>
      <span aria-hidden="true">·</span>
      <span className="truncate">{addressLabel}</span>
    </span>
  );
}

function SortableBranchRow({
  branch,
  disabled,
  isDefault,
  onOpen,
  onActiveChange,
}: {
  branch: BranchRow;
  disabled: boolean;
  isDefault: boolean;
  onOpen: () => void;
  onActiveChange: (checked: boolean) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: branch.id, disabled });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`${doctorDnaFlatListRowClass} items-center transition-colors hover:bg-muted focus-within:bg-muted ${isDragging ? 'bg-muted shadow-sm' : ''}`}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="-ml-1 flex size-7 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
        aria-label={`Изменить порядок: ${branch.title}`}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <button
        type="button"
        className="flex min-w-0 flex-1 cursor-pointer flex-col self-stretch justify-center text-left focus-visible:outline-none"
        onClick={onOpen}
      >
        <span className={`${doctorDnaFlatListPrimaryClass} block truncate`}>{branch.title}</span>
        <BranchMeta branch={branch} />
      </button>
      {isDefault ? (
        <Flag className="size-4 shrink-0 fill-primary text-primary" aria-label="По умолчанию" />
      ) : null}
      <Switch
        className="shrink-0"
        checked={branch.isActive}
        disabled={disabled}
        aria-label={`${branch.title} — активен`}
        onCheckedChange={onActiveChange}
      />
    </li>
  );
}

export function BookingSoloLocationsSection() {
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [orgTitle, setOrgTitle] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [pending, startTransition] = useTransition();
  const [defaultBranchId, setDefaultBranchId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createAsDefault, setCreateAsDefault] = useState(false);
  const [title, setTitle] = useState('');
  const [shortTitle, setShortTitle] = useState('');
  const [address, setAddress] = useState('');
  const [timezone, setTimezone] = useState('Europe/Moscow');
  const [editedBranch, setEditedBranch] = useState<BranchRow | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editShortTitle, setEditShortTitle] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editColor, setEditColor] = useState(DEFAULT_BRANCH_COLOR);
  const [editTimezone, setEditTimezone] = useState('Europe/Moscow');
  const [editActive, setEditActive] = useState(true);
  const [editAsDefault, setEditAsDefault] = useState(false);
  const dndContextId = useId();
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    setLoadError(null);
    setUnavailable(false);
    try {
      const [data, currentDefaultBranchId] = await Promise.all([
        fetchSoloOverview(),
        fetchBookingDefaultId('branch'),
      ]);
      if (!data) {
        setUnavailable(true);
        return;
      }
      setBranches(data.branches);
      setOrgTitle(data.organization?.title ?? '');
      setDefaultBranchId(currentDefaultBranchId);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'load_failed');
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  function run(task: () => Promise<void>, onSuccess?: () => void) {
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
    setTitle('');
    setShortTitle('');
    setAddress('');
    setTimezone('Europe/Moscow');
    setCreateAsDefault(false);
  }

  function createBranch() {
    if (!title.trim()) return;
    run(
      async () => {
        await ensureDefaultSpecialist(orgTitle);
        const maxOrder = branches.reduce(
          (current, branch) => Math.max(current, branch.sortOrder),
          0,
        );
        const created = await apiJson<{ ok: boolean; branch: { id: string } }>(`${BASE}/branches`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            shortTitle: shortTitle.trim() || null,
            cityCode: slugCityCode(title),
            address: address.trim() || null,
            timezone,
            sortOrder: maxOrder + 10,
          }),
        });
        if (createAsDefault) await setBookingDefaultId('branch', created.branch.id);
      },
      () => {
        resetCreateForm();
        setCreateOpen(false);
      },
    );
  }

  function openPhysicalBranch(branch: BranchRow) {
    setActionError(null);
    setEditedBranch(branch);
    setEditTitle(branch.title);
    setEditShortTitle(branch.shortTitle ?? '');
    setEditAddress(branch.address ?? '');
    setEditColor(branch.color ?? DEFAULT_BRANCH_COLOR);
    setEditTimezone(branch.timezone);
    setEditActive(branch.isActive);
    setEditAsDefault(branch.id === defaultBranchId);
  }

  function saveEditedBranch() {
    if (!editedBranch) return;
    run(
      async () => {
        await apiJson(`${BASE}/branches/${editedBranch.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: editTitle.trim(),
            shortTitle: editShortTitle.trim() || null,
            color: editColor,
            address: editAddress.trim() || null,
            timezone: editTimezone,
            isActive: editActive,
          }),
        });
        if (editAsDefault) {
          await setBookingDefaultId('branch', editedBranch.id);
        } else if (editedBranch.id === defaultBranchId) {
          await setBookingDefaultId('branch', null);
        }
      },
      () => setEditedBranch(null),
    );
  }

  function setBranchActive(branch: BranchRow, isActive: boolean) {
    run(async () => {
      await apiJson(`${BASE}/branches/${branch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      if (!isActive && branch.id === defaultBranchId) {
        await setBookingDefaultId('branch', null);
      }
    });
  }

  function reorderBranches(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = physicalBranches.findIndex((branch) => branch.id === active.id);
    const newIndex = physicalBranches.findIndex((branch) => branch.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(physicalBranches, oldIndex, newIndex).map((branch, index) => ({
      ...branch,
      sortOrder: (index + 1) * 10,
    }));
    const nextOrderById = new Map(reordered.map((branch) => [branch.id, branch.sortOrder]));
    setBranches((current) =>
      current.map((branch) => {
        const sortOrder = nextOrderById.get(branch.id);
        return sortOrder === undefined ? branch : { ...branch, sortOrder };
      }),
    );
    setActionError(null);
    startTransition(async () => {
      try {
        await Promise.all(
          reordered.map((branch) =>
            apiJson(`${BASE}/branches/${branch.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sortOrder: branch.sortOrder }),
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

  if (unavailable) {
    return <p className="text-sm text-muted-foreground">{SOLO_BOOKING_UNAVAILABLE_MESSAGE}</p>;
  }

  const onlineLocation = branches.find(isBuiltInOnlineLocation) ?? null;
  const physicalBranches = branches
    .filter((branch) => !isBuiltInOnlineLocation(branch))
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, 'ru'),
    );

  return (
    <>
      <DoctorSection>
        <DoctorSectionHeader className="flex-row items-center justify-between gap-3">
          <DoctorSectionTitle>Филиалы</DoctorSectionTitle>
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => {
              setActionError(null);
              setCreateOpen(true);
            }}
          >
            Добавить филиал
          </Button>
        </DoctorSectionHeader>

        {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
        {actionError && !createOpen && !editedBranch ? (
          <p className="text-sm text-destructive">{actionError}</p>
        ) : null}

        <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-3">
          <Label htmlFor="booking-online-location">Онлайн</Label>
          <div className="flex items-center gap-3">
            <DoctorColorPicker
              label="Цвет онлайн-локации"
              value={onlineLocation?.color ?? DEFAULT_BOOKING_LOCATION_PALETTE.online}
              disabled={pending}
              onChange={(next) =>
                run(() => setOnlineLocationEnabled(onlineLocation?.isActive ?? false, next))
              }
            />
            <Switch
              id="booking-online-location"
              checked={onlineLocation?.isActive ?? false}
              disabled={pending}
              onCheckedChange={(checked) => run(() => setOnlineLocationEnabled(checked))}
            />
          </div>
        </div>

        <DndContext
          id={dndContextId}
          sensors={dndSensors}
          collisionDetection={closestCenter}
          onDragEnd={reorderBranches}
        >
          <SortableContext
            items={physicalBranches.map((branch) => branch.id)}
            strategy={verticalListSortingStrategy}
            disabled={pending}
          >
            <DoctorDnaFlatList aria-label="Филиалы">
              {physicalBranches.map((branch) => (
                <SortableBranchRow
                  key={branch.id}
                  branch={branch}
                  disabled={pending}
                  isDefault={branch.id === defaultBranchId}
                  onOpen={() => openPhysicalBranch(branch)}
                  onActiveChange={(checked) => setBranchActive(branch, checked)}
                />
              ))}
            </DoctorDnaFlatList>
          </SortableContext>
        </DndContext>
        {physicalBranches.length === 0 ? (
          <p className="text-sm text-muted-foreground">Филиалов пока нет.</p>
        ) : null}
      </DoctorSection>

      <DoctorModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Новый филиал"
        size="md"
        footer={
          <>
            <Button type="button" size="sm" variant="outline" onClick={() => setCreateOpen(false)}>
              Отмена
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pending || !title.trim()}
              onClick={createBranch}
            >
              Создать
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}
          <div className="flex flex-col gap-1">
            <Label htmlFor="branch-create-title">Полное название</Label>
            <Input
              id="branch-create-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="branch-create-short-title">Короткое название</Label>
            <Input
              id="branch-create-short-title"
              maxLength={12}
              value={shortTitle}
              onChange={(event) => setShortTitle(event.target.value.slice(0, 12))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="branch-create-address">Адрес</Label>
            <Input
              id="branch-create-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Часовой пояс</Label>
            <DoctorTimezoneSelect
              instanceId="solo-branch-create-timezone"
              aria-label="Часовой пояс филиала"
              value={timezone}
              onChange={setTimezone}
              disabled={pending}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={createAsDefault} onCheckedChange={setCreateAsDefault} />
            Выбрать филиалом по умолчанию
          </label>
        </div>
      </DoctorModal>

      <DoctorModal
        open={editedBranch !== null}
        onClose={() => setEditedBranch(null)}
        title="Редактировать филиал"
        size="md"
        footer={
          <>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditedBranch(null)}>
              Отмена
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pending || !editTitle.trim()}
              onClick={saveEditedBranch}
            >
              Сохранить
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}
          <div className="flex flex-col gap-1">
            <Label htmlFor="branch-edit-title">Полное название</Label>
            <Input
              id="branch-edit-title"
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="branch-edit-short-title">Короткое название</Label>
            <Input
              id="branch-edit-short-title"
              maxLength={12}
              value={editShortTitle}
              onChange={(event) => setEditShortTitle(event.target.value.slice(0, 12))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="branch-edit-address">Адрес</Label>
            <Input
              id="branch-edit-address"
              value={editAddress}
              onChange={(event) => setEditAddress(event.target.value)}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <Label>Цвет</Label>
            <DoctorColorPicker
              label="Цвет филиала"
              value={editColor}
              disabled={pending}
              onChange={setEditColor}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label>Часовой пояс</Label>
            <DoctorTimezoneSelect
              instanceId={`solo-branch-edit-timezone-${editedBranch?.id ?? 'closed'}`}
              aria-label={`Часовой пояс — ${editedBranch?.title ?? ''}`}
              value={editTimezone}
              onChange={setEditTimezone}
              disabled={pending}
            />
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            Активен
            <Switch checked={editActive} disabled={pending} onCheckedChange={setEditActive} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={editAsDefault}
              disabled={!editActive && !editAsDefault}
              onCheckedChange={setEditAsDefault}
            />
            Выбрать филиалом по умолчанию
          </label>
        </div>
      </DoctorModal>
    </>
  );
}
