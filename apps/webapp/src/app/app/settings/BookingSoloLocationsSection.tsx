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
import { Switch } from '@/shared/ui/doctor/primitives/switch';
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
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { DoctorSortableSettingsRow } from '@/shared/ui/doctor/DoctorSortableSettingsRow';
import {
  SOLO_BOOKING_UNAVAILABLE_MESSAGE,
  apiJson,
  fetchSoloOverview,
  setOnlineLocationEnabled,
  slugCityCode,
  type SoloOverview,
} from '@/app/app/settings/bookingSoloAdminApi';
import { isBuiltInOnlineLocation } from '@/modules/booking-engine/onlineLocation';
import { DEFAULT_BOOKING_LOCATION_PALETTE } from '@/modules/booking-engine/locationPalette';
import { DoctorTimezoneSelect } from '@/shared/ui/doctor/DoctorTimezoneSelect';

const BASE = '/api/admin/booking-engine';
const DEFAULT_BRANCH_COLOR = '#2563eb';

type BranchRow = SoloOverview['branches'][0];

function BranchMeta({ branch }: { branch: BranchRow }) {
  const color = branch.color ?? DEFAULT_BRANCH_COLOR;
  const shortLabel = branch.shortTitle?.trim() || '—';
  const addressLabel = branch.address?.trim() || '—';
  return (
    <span
      className={`${doctorDnaFlatListMetaClass} flex w-full min-w-0 items-center gap-2 overflow-hidden`}
    >
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

export function BookingSoloLocationsSection() {
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
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
  const dndContextId = useId();
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    setLoadError(null);
    setUnavailable(false);
    try {
      const data = await fetchSoloOverview();
      if (!data) {
        setUnavailable(true);
        return;
      }
      setBranches(data.branches);
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
  }

  function createBranch() {
    if (!title.trim()) return;
    run(
      async () => {
        const maxOrder = branches.reduce(
          (current, branch) => Math.max(current, branch.sortOrder),
          0,
        );
        await apiJson<{ ok: boolean; branch: { id: string } }>(`${BASE}/branches`, {
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
          }),
        });
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
                <DoctorSortableSettingsRow
                  key={branch.id}
                  id={branch.id}
                  label={branch.title}
                  disabled={pending}
                  active={branch.isActive}
                  onOpen={() => openPhysicalBranch(branch)}
                  onActiveChange={(checked) => setBranchActive(branch, checked)}
                >
                  <span className={`${doctorDnaFlatListPrimaryClass} block truncate`}>
                    {branch.title}
                  </span>
                  <BranchMeta branch={branch} />
                </DoctorSortableSettingsRow>
              ))}
            </DoctorDnaFlatList>
          </SortableContext>
        </DndContext>
        {physicalBranches.length === 0 ? (
          <p className="text-sm text-muted-foreground">Филиалов пока нет.</p>
        ) : null}
      </DoctorSection>

      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Онлайн</DoctorSectionTitle>
        </DoctorSectionHeader>

        <div className="flex min-w-0 items-center justify-between gap-3 py-1">
          <Label className="min-w-0" htmlFor="booking-online-location">
            Разрешить онлайн-запись
          </Label>
          <div className="flex shrink-0 items-center gap-3">
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
              maxLength={10}
              value={shortTitle}
              onChange={(event) => setShortTitle(event.target.value.slice(0, 10))}
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
              maxLength={10}
              value={editShortTitle}
              onChange={(event) => setEditShortTitle(event.target.value.slice(0, 10))}
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
          <div className="flex flex-col gap-3 pt-1">
            <div className="flex items-center gap-3 text-sm">
              <DoctorColorPicker
                label="Цвет филиала"
                value={editColor}
                disabled={pending}
                onChange={setEditColor}
              />
              <span>Цвет</span>
            </div>
          </div>
        </div>
      </DoctorModal>
    </>
  );
}
