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
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
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
import { cn } from '@/lib/utils';
import {
  SOLO_BOOKING_UNAVAILABLE_MESSAGE,
  apiJson,
  fetchBookingDefaultId,
  fetchSoloOverview,
  minorToRublesInput,
  parseRublesInput,
  rublesToMinor,
  setBookingDefaultId,
  type SoloOverview,
} from '@/app/app/settings/bookingSoloAdminApi';

const BASE = '/api/admin/booking-engine';
const PREPAYMENT_API = `${BASE}/prepayment-policies`;

type ServiceRow = SoloOverview['services'][0];
type PrepaymentMode = 'disabled' | 'fixed_minor' | 'percent' | 'full_price';
type PrepaymentUnit = 'rubles' | 'percent';
type PrepaymentPolicy = {
  serviceId: string | null;
  mode: PrepaymentMode;
  amountMinor: number | null;
  percentBps: number | null;
  isActive?: boolean;
};
type PrepaymentAvailability = {
  available: boolean;
  reason: string | null;
};
type PrepaymentDraft = {
  enabled: boolean;
  unit: PrepaymentUnit;
  value: string;
};

const EMPTY_PREPAYMENT: PrepaymentDraft = { enabled: false, unit: 'rubles', value: '' };

function formatPrice(priceMinor: number) {
  return `${(priceMinor / 100).toLocaleString('ru-RU')} ₽`;
}

function policyToDraft(policy: PrepaymentPolicy | undefined): PrepaymentDraft {
  if (!policy || policy.mode === 'disabled' || policy.isActive === false) return EMPTY_PREPAYMENT;
  if (policy.mode === 'fixed_minor') {
    return {
      enabled: true,
      unit: 'rubles',
      value: policy.amountMinor == null ? '' : minorToRublesInput(policy.amountMinor),
    };
  }
  return {
    enabled: true,
    unit: 'percent',
    value: policy.mode === 'full_price' ? '100' : String((policy.percentBps ?? 0) / 100),
  };
}

function prepaymentBody(serviceId: string, draft: PrepaymentDraft) {
  if (!draft.enabled) {
    return {
      scope: 'service' as const,
      serviceId,
      mode: 'disabled' as const,
      amountMinor: null,
      percentBps: null,
      isActive: false,
    };
  }
  if (draft.unit === 'rubles') {
    return {
      scope: 'service' as const,
      serviceId,
      mode: 'fixed_minor' as const,
      amountMinor: rublesToMinor(parseRublesInput(draft.value)),
      percentBps: null,
      isActive: true,
    };
  }
  const percent = Number(draft.value.replace(',', '.'));
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error('invalid_prepayment_percent');
  }
  return {
    scope: 'service' as const,
    serviceId,
    mode: 'percent' as const,
    amountMinor: null,
    percentBps: Math.round(percent * 100),
    isActive: true,
  };
}

function formatPrepayment(policy: PrepaymentPolicy | undefined): string {
  if (!policy || policy.mode === 'disabled' || policy.isActive === false) return '—';
  if (policy.mode === 'fixed_minor') {
    return policy.amountMinor == null ? '—' : formatPrice(policy.amountMinor);
  }
  if (policy.mode === 'full_price') return '100%';
  return policy.percentBps == null ? '—' : `${policy.percentBps / 100}%`;
}

export function BookingSoloServicesSection() {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [prepaymentPolicies, setPrepaymentPolicies] = useState<PrepaymentPolicy[]>([]);
  const [prepaymentAvailability, setPrepaymentAvailability] =
    useState<PrepaymentAvailability | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [pending, startTransition] = useTransition();
  const [defaultServiceId, setDefaultServiceId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('60');
  const [bufferAfter, setBufferAfter] = useState('0');
  const [priceRub, setPriceRub] = useState('5000');
  const [prepayment, setPrepayment] = useState<PrepaymentDraft>(EMPTY_PREPAYMENT);
  const [onlinePaymentApplicable, setOnlinePaymentApplicable] = useState(false);
  const [createAsDefault, setCreateAsDefault] = useState(false);
  const [editedService, setEditedService] = useState<ServiceRow | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [editBufferAfter, setEditBufferAfter] = useState('');
  const [editPriceRub, setEditPriceRub] = useState('');
  const [editPrepayment, setEditPrepayment] = useState<PrepaymentDraft>(EMPTY_PREPAYMENT);
  const [editOnlinePaymentApplicable, setEditOnlinePaymentApplicable] = useState(false);
  const [editAsDefault, setEditAsDefault] = useState(false);
  const dndContextId = useId();
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const canEditPrepayment = prepaymentAvailability?.available ?? false;

  const load = useCallback(async () => {
    setLoadError(null);
    setUnavailable(false);
    try {
      const [data, currentDefaultServiceId, prepaymentJson] = await Promise.all([
        fetchSoloOverview(),
        fetchBookingDefaultId('service'),
        apiJson<{
          ok?: boolean;
          policies?: PrepaymentPolicy[];
          availability?: PrepaymentAvailability;
          visible?: boolean;
        }>(PREPAYMENT_API).catch(() => null),
      ]);
      if (!data) {
        setUnavailable(true);
        return;
      }
      setServices(
        [...data.services].sort(
          (left, right) =>
            left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, 'ru'),
        ),
      );
      setDefaultServiceId(currentDefaultServiceId);
      setPrepaymentPolicies(prepaymentJson?.visible === false ? [] : (prepaymentJson?.policies ?? []));
      setPrepaymentAvailability(prepaymentJson?.availability ?? null);
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
    setDescription('');
    setDuration('60');
    setBufferAfter('0');
    setPriceRub('5000');
    setPrepayment(EMPTY_PREPAYMENT);
    setOnlinePaymentApplicable(false);
    setCreateAsDefault(false);
  }

  function createService() {
    if (!title.trim()) return;
    run(
      async () => {
        const rub = parseRublesInput(priceRub);
        const maxOrder = services.reduce(
          (current, service) => Math.max(current, service.sortOrder),
          0,
        );
        const created = await apiJson<{ ok: boolean; service: { id: string } }>(
          `${BASE}/services`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: title.trim(),
              description: description.trim() || null,
              durationMinutes: Number(duration),
              bufferAfterMinutes: Number(bufferAfter),
              priceMinor: rublesToMinor(rub),
              isActive: true,
              publicWidgetVisible: true,
              adminManualOnly: false,
              usableInPackages: true,
              prepaymentApplicable: prepayment.enabled,
              onlinePaymentApplicable,
              sortOrder: maxOrder + 10,
            }),
          },
        );
        if (prepayment.enabled) {
          await apiJson(PREPAYMENT_API, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(prepaymentBody(created.service.id, prepayment)),
          });
        }
        if (createAsDefault) await setBookingDefaultId('service', created.service.id);
      },
      () => {
        resetCreateForm();
        setCreateOpen(false);
      },
    );
  }

  function openService(service: ServiceRow) {
    setActionError(null);
    setEditedService(service);
    setEditTitle(service.title);
    setEditDescription(service.description ?? '');
    setEditDuration(String(service.durationMinutes));
    setEditBufferAfter(String(service.bufferAfterMinutes));
    setEditPriceRub(minorToRublesInput(service.priceMinor));
    setEditPrepayment(
      policyToDraft(prepaymentPolicies.find((policy) => policy.serviceId === service.id)),
    );
    setEditOnlinePaymentApplicable(service.onlinePaymentApplicable);
    setEditAsDefault(service.id === defaultServiceId);
  }

  function saveEditedService() {
    if (!editedService) return;
    run(
      async () => {
        const rub = parseRublesInput(editPriceRub);
        await apiJson(`${BASE}/services/${editedService.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: editTitle.trim(),
            description: editDescription.trim() || null,
            durationMinutes: Number(editDuration),
            bufferAfterMinutes: Number(editBufferAfter),
            priceMinor: rublesToMinor(rub),
            usableInPackages: true,
            prepaymentApplicable: canEditPrepayment
              ? editPrepayment.enabled
              : editedService.prepaymentApplicable,
            onlinePaymentApplicable: editOnlinePaymentApplicable,
          }),
        });
        if (canEditPrepayment) {
          await apiJson(PREPAYMENT_API, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(prepaymentBody(editedService.id, editPrepayment)),
          });
        }
        if (editAsDefault) {
          await setBookingDefaultId('service', editedService.id);
        } else if (editedService.id === defaultServiceId) {
          await setBookingDefaultId('service', null);
        }
      },
      () => setEditedService(null),
    );
  }

  function setServiceActive(service: ServiceRow, enabled: boolean) {
    run(async () => {
      await apiJson(`${BASE}/services/${service.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isActive: enabled,
          publicWidgetVisible: enabled,
          adminManualOnly: !enabled,
        }),
      });
      if (!enabled && service.id === defaultServiceId) {
        await setBookingDefaultId('service', null);
      }
    });
  }

  function reorderServices(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = services.findIndex((service) => service.id === active.id);
    const newIndex = services.findIndex((service) => service.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(services, oldIndex, newIndex).map((service, index) => ({
      ...service,
      sortOrder: (index + 1) * 10,
    }));
    setServices(reordered);
    setActionError(null);
    startTransition(async () => {
      try {
        await Promise.all(
          reordered.map((service) =>
            apiJson(`${BASE}/services/${service.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sortOrder: service.sortOrder }),
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

  return (
    <>
      <DoctorSection>
        <DoctorSectionHeader className="flex-row items-center justify-between gap-3">
          <DoctorSectionTitle>Услуги</DoctorSectionTitle>
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => {
              setActionError(null);
              setCreateOpen(true);
            }}
          >
            Добавить услугу
          </Button>
        </DoctorSectionHeader>

        {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
        {actionError && !createOpen && !editedService ? (
          <p className="text-sm text-destructive">{actionError}</p>
        ) : null}

        <DndContext
          id={dndContextId}
          sensors={dndSensors}
          collisionDetection={closestCenter}
          onDragEnd={reorderServices}
        >
          <SortableContext
            items={services.map((service) => service.id)}
            strategy={verticalListSortingStrategy}
            disabled={pending}
          >
            <DoctorDnaFlatList aria-label="Услуги">
              {services.map((service) => {
                const policy = prepaymentPolicies.find(
                  (candidate) => candidate.serviceId === service.id,
                );
                return (
                  <DoctorSortableSettingsRow
                    key={service.id}
                    id={service.id}
                    label={service.title}
                    disabled={pending}
                    active={service.isActive}
                    isDefault={service.id === defaultServiceId}
                    trailing={
                      <span className="text-sm text-foreground">
                        {formatPrice(service.priceMinor)}
                      </span>
                    }
                    onOpen={() => openService(service)}
                    onActiveChange={(checked) => setServiceActive(service, checked)}
                  >
                    <span
                      className={`${doctorDnaFlatListPrimaryClass} block truncate ${!service.isActive ? 'text-muted-foreground line-through' : ''}`}
                    >
                      {service.title}
                    </span>
                    <span className={`${doctorDnaFlatListMetaClass} block truncate`}>
                      {service.durationMinutes} мин, перерыв {service.bufferAfterMinutes} мин
                    </span>
                    <span className={`${doctorDnaFlatListMetaClass} block truncate`}>
                      Онлайн {service.onlinePaymentApplicable ? '✓' : '—'} · Предоплата{' '}
                      {formatPrepayment(policy)}
                    </span>
                  </DoctorSortableSettingsRow>
                );
              })}
            </DoctorDnaFlatList>
          </SortableContext>
        </DndContext>
        {services.length === 0 ? (
          <p className="text-sm text-muted-foreground">Услуг пока нет.</p>
        ) : null}
      </DoctorSection>

      <ServiceModal
        mode="create"
        open={createOpen}
        pending={pending}
        title={title}
        description={description}
        duration={duration}
        bufferAfter={bufferAfter}
        priceRub={priceRub}
        prepayment={prepayment}
        canEditPrepayment={canEditPrepayment}
        canSetDefault
        onlinePaymentApplicable={onlinePaymentApplicable}
        asDefault={createAsDefault}
        error={actionError}
        onTitleChange={setTitle}
        onDescriptionChange={setDescription}
        onDurationChange={setDuration}
        onBufferAfterChange={setBufferAfter}
        onPriceChange={setPriceRub}
        onPrepaymentChange={setPrepayment}
        onOnlinePaymentApplicableChange={setOnlinePaymentApplicable}
        onDefaultChange={setCreateAsDefault}
        onClose={() => setCreateOpen(false)}
        onSubmit={createService}
      />

      <ServiceModal
        mode="edit"
        open={editedService !== null}
        pending={pending}
        title={editTitle}
        description={editDescription}
        duration={editDuration}
        bufferAfter={editBufferAfter}
        priceRub={editPriceRub}
        prepayment={editPrepayment}
        canEditPrepayment={canEditPrepayment}
        canSetDefault={editedService?.isActive ?? false}
        onlinePaymentApplicable={editOnlinePaymentApplicable}
        asDefault={editAsDefault}
        error={actionError}
        onTitleChange={setEditTitle}
        onDescriptionChange={setEditDescription}
        onDurationChange={setEditDuration}
        onBufferAfterChange={setEditBufferAfter}
        onPriceChange={setEditPriceRub}
        onPrepaymentChange={setEditPrepayment}
        onOnlinePaymentApplicableChange={setEditOnlinePaymentApplicable}
        onDefaultChange={setEditAsDefault}
        onClose={() => setEditedService(null)}
        onSubmit={saveEditedService}
      />
    </>
  );
}

type ServiceModalProps = {
  mode: 'create' | 'edit';
  open: boolean;
  pending: boolean;
  title: string;
  description: string;
  duration: string;
  bufferAfter: string;
  priceRub: string;
  prepayment: PrepaymentDraft;
  canEditPrepayment: boolean;
  canSetDefault: boolean;
  onlinePaymentApplicable: boolean;
  asDefault: boolean;
  error: string | null;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onDurationChange: (value: string) => void;
  onBufferAfterChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onPrepaymentChange: (value: PrepaymentDraft) => void;
  onOnlinePaymentApplicableChange: (value: boolean) => void;
  onDefaultChange: (value: boolean) => void;
  onClose: () => void;
  onSubmit: () => void;
};

function ServiceModal({
  mode,
  open,
  pending,
  title,
  description,
  duration,
  bufferAfter,
  priceRub,
  prepayment,
  canEditPrepayment,
  canSetDefault,
  onlinePaymentApplicable,
  asDefault,
  error,
  onTitleChange,
  onDescriptionChange,
  onDurationChange,
  onBufferAfterChange,
  onPriceChange,
  onPrepaymentChange,
  onOnlinePaymentApplicableChange,
  onDefaultChange,
  onClose,
  onSubmit,
}: ServiceModalProps) {
  const prefix = mode === 'create' ? 'service-create' : 'service-edit';
  return (
    <DoctorModal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Новая услуга' : 'Редактировать услугу'}
      size="md"
      footer={
        <Button type="button" size="sm" disabled={pending || !title.trim()} onClick={onSubmit}>
          {mode === 'create' ? 'Создать' : 'Сохранить'}
        </Button>
      }
    >
      <div className="flex min-h-0 flex-col gap-3">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${prefix}-title`}>Название</Label>
          <Input
            id={`${prefix}-title`}
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${prefix}-duration`}>Длительность, мин</Label>
            <Input
              id={`${prefix}-duration`}
              type="number"
              min={1}
              value={duration}
              onChange={(event) => onDurationChange(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${prefix}-buffer`}>Перерыв, мин</Label>
            <Input
              id={`${prefix}-buffer`}
              type="number"
              min={0}
              step={5}
              value={bufferAfter}
              onChange={(event) => onBufferAfterChange(event.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${prefix}-price`}>Цена, ₽</Label>
          <Input
            id={`${prefix}-price`}
            type="number"
            min={0}
            step="0.01"
            value={priceRub}
            onChange={(event) => onPriceChange(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-3 pt-1">
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={onlinePaymentApplicable}
              disabled={pending}
              onCheckedChange={onOnlinePaymentApplicableChange}
            />
            Онлайн-оплата
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={asDefault}
              disabled={pending || (!canSetDefault && !asDefault)}
              onCheckedChange={onDefaultChange}
            />
            Услуга по умолчанию
          </label>
          <PrepaymentControl
            value={prepayment}
            disabled={pending || !canEditPrepayment}
            onChange={onPrepaymentChange}
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

function PrepaymentControl({
  value,
  disabled,
  onChange,
}: {
  value: PrepaymentDraft;
  disabled: boolean;
  onChange: (value: PrepaymentDraft) => void;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <label className="flex shrink-0 items-center gap-3 text-sm">
        <Switch
          checked={value.enabled}
          disabled={disabled}
          onCheckedChange={(enabled) => onChange({ ...value, enabled })}
        />
        Предоплата
      </label>
      {value.enabled ? (
        <div className="flex min-w-0 items-center gap-1.5">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            max={value.unit === 'percent' ? 100 : undefined}
            step={value.unit === 'percent' ? 1 : '0.01'}
            className="w-24"
            aria-label="Размер предоплаты"
            value={value.value}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, value: event.target.value })}
          />
          <div className="flex shrink-0 gap-1" role="group" aria-label="Единица предоплаты">
            <button
              type="button"
              className={cn(
                'h-8 min-w-8 rounded-[8px] border px-2 text-sm transition-colors',
                value.unit === 'rubles'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-white text-foreground',
              )}
              disabled={disabled}
              aria-pressed={value.unit === 'rubles'}
              onClick={() => onChange({ ...value, unit: 'rubles' })}
            >
              ₽
            </button>
            <button
              type="button"
              className={cn(
                'h-8 min-w-8 rounded-[8px] border px-2 text-sm transition-colors',
                value.unit === 'percent'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-white text-foreground',
              )}
              disabled={disabled}
              aria-pressed={value.unit === 'percent'}
              onClick={() => onChange({ ...value, unit: 'percent' })}
            >
              %
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
