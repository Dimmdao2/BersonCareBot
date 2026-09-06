'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import { Switch } from '@/shared/ui/doctor/primitives/switch';
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
import { Flag } from 'lucide-react';
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

type ServiceRow = SoloOverview['services'][0];

function formatPrice(priceMinor: number) {
  return `${(priceMinor / 100).toLocaleString('ru-RU')} ₽`;
}

function ServiceFlag({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span>{label}</span>
      <span aria-label={`${label}: ${enabled ? 'да' : 'нет'}`}>{enabled ? '✓' : '—'}</span>
    </span>
  );
}

export function BookingSoloServicesSection() {
  const [services, setServices] = useState<ServiceRow[]>([]);
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
  const [serviceEnabled, setServiceEnabled] = useState(true);
  const [usableInPackages, setUsableInPackages] = useState(true);
  const [prepaymentApplicable, setPrepaymentApplicable] = useState(false);
  const [onlinePaymentApplicable, setOnlinePaymentApplicable] = useState(false);
  const [createAsDefault, setCreateAsDefault] = useState(false);
  const [editedService, setEditedService] = useState<ServiceRow | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [editBufferAfter, setEditBufferAfter] = useState('');
  const [editPriceRub, setEditPriceRub] = useState('');
  const [editEnabled, setEditEnabled] = useState(true);
  const [editUsableInPackages, setEditUsableInPackages] = useState(true);
  const [editPrepaymentApplicable, setEditPrepaymentApplicable] = useState(false);
  const [editOnlinePaymentApplicable, setEditOnlinePaymentApplicable] = useState(false);
  const [editAsDefault, setEditAsDefault] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    setUnavailable(false);
    try {
      const [data, currentDefaultServiceId] = await Promise.all([
        fetchSoloOverview(),
        fetchBookingDefaultId('service'),
      ]);
      if (!data) {
        setUnavailable(true);
        return;
      }
      setServices(data.services);
      setDefaultServiceId(currentDefaultServiceId);
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
    setServiceEnabled(true);
    setUsableInPackages(true);
    setPrepaymentApplicable(false);
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
              isActive: serviceEnabled,
              publicWidgetVisible: serviceEnabled,
              adminManualOnly: !serviceEnabled,
              usableInPackages,
              prepaymentApplicable,
              onlinePaymentApplicable,
              sortOrder: maxOrder + 10,
            }),
          },
        );
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
    setEditEnabled(service.isActive);
    setEditUsableInPackages(service.usableInPackages);
    setEditPrepaymentApplicable(service.prepaymentApplicable);
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
            isActive: editEnabled,
            publicWidgetVisible: editEnabled,
            adminManualOnly: !editEnabled,
            usableInPackages: editUsableInPackages,
            prepaymentApplicable: editPrepaymentApplicable,
            onlinePaymentApplicable: editOnlinePaymentApplicable,
          }),
        });
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

        <DoctorDnaFlatList aria-label="Услуги">
          {services.map((service) => (
            <li
              key={service.id}
              className={`${doctorDnaFlatListRowClass} transition-colors hover:bg-muted focus-within:bg-muted`}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 cursor-pointer flex-col self-stretch justify-center gap-0.5 text-left focus-visible:outline-none"
                onClick={() => openService(service)}
              >
                <span className="flex min-w-0 items-baseline justify-between gap-4">
                  <span
                    className={`${doctorDnaFlatListPrimaryClass} block truncate ${!service.isActive ? 'text-muted-foreground line-through' : ''}`}
                  >
                    {service.title}
                  </span>
                  <span className="shrink-0 text-sm text-foreground">
                    {formatPrice(service.priceMinor)}
                  </span>
                </span>
                <span
                  className={`${doctorDnaFlatListMetaClass} flex flex-wrap items-center gap-x-3 gap-y-0.5`}
                >
                  <span className="whitespace-nowrap">
                    Длительность {service.durationMinutes} мин, перерыв {service.bufferAfterMinutes}{' '}
                    мин
                  </span>
                  <ServiceFlag label="Абонемент" enabled={service.usableInPackages} />
                  <ServiceFlag label="Предоплата" enabled={service.prepaymentApplicable} />
                  <ServiceFlag label="Онлайн" enabled={service.onlinePaymentApplicable} />
                </span>
              </button>
              {service.id === defaultServiceId ? (
                <Flag
                  className="size-4 shrink-0 fill-primary text-primary"
                  aria-label="По умолчанию"
                />
              ) : null}
              <Switch
                className="shrink-0"
                checked={service.isActive}
                disabled={pending}
                aria-label={`${service.title} — включена`}
                onCheckedChange={(checked) => setServiceActive(service, checked)}
              />
            </li>
          ))}
        </DoctorDnaFlatList>
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
        enabled={serviceEnabled}
        usableInPackages={usableInPackages}
        prepaymentApplicable={prepaymentApplicable}
        onlinePaymentApplicable={onlinePaymentApplicable}
        asDefault={createAsDefault}
        error={actionError}
        onTitleChange={setTitle}
        onDescriptionChange={setDescription}
        onDurationChange={setDuration}
        onBufferAfterChange={setBufferAfter}
        onPriceChange={setPriceRub}
        onEnabledChange={setServiceEnabled}
        onUsableInPackagesChange={setUsableInPackages}
        onPrepaymentApplicableChange={setPrepaymentApplicable}
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
        enabled={editEnabled}
        usableInPackages={editUsableInPackages}
        prepaymentApplicable={editPrepaymentApplicable}
        onlinePaymentApplicable={editOnlinePaymentApplicable}
        asDefault={editAsDefault}
        error={actionError}
        onTitleChange={setEditTitle}
        onDescriptionChange={setEditDescription}
        onDurationChange={setEditDuration}
        onBufferAfterChange={setEditBufferAfter}
        onPriceChange={setEditPriceRub}
        onEnabledChange={setEditEnabled}
        onUsableInPackagesChange={setEditUsableInPackages}
        onPrepaymentApplicableChange={setEditPrepaymentApplicable}
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
  enabled: boolean;
  usableInPackages: boolean;
  prepaymentApplicable: boolean;
  onlinePaymentApplicable: boolean;
  asDefault: boolean;
  error: string | null;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onDurationChange: (value: string) => void;
  onBufferAfterChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onEnabledChange: (value: boolean) => void;
  onUsableInPackagesChange: (value: boolean) => void;
  onPrepaymentApplicableChange: (value: boolean) => void;
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
  enabled,
  usableInPackages,
  prepaymentApplicable,
  onlinePaymentApplicable,
  asDefault,
  error,
  onTitleChange,
  onDescriptionChange,
  onDurationChange,
  onBufferAfterChange,
  onPriceChange,
  onEnabledChange,
  onUsableInPackagesChange,
  onPrepaymentApplicableChange,
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
        <>
          <Button type="button" size="sm" variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button type="button" size="sm" disabled={pending || !title.trim()} onClick={onSubmit}>
            {mode === 'create' ? 'Создать' : 'Сохранить'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${prefix}-title`}>Название</Label>
          <Input
            id={`${prefix}-title`}
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${prefix}-description`}>Описание для пациента</Label>
          <Input
            id={`${prefix}-description`}
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
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
              checked={usableInPackages}
              disabled={pending}
              onCheckedChange={onUsableInPackagesChange}
            />
            Доступна для абонементов
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={prepaymentApplicable}
              disabled={pending}
              onCheckedChange={onPrepaymentApplicableChange}
            />
            Предоплата
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={onlinePaymentApplicable}
              disabled={pending}
              onCheckedChange={onOnlinePaymentApplicableChange}
            />
            Онлайн-оплата
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={enabled} disabled={pending} onCheckedChange={onEnabledChange} />
            Услуга включена
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={asDefault}
              disabled={pending || (!enabled && !asDefault)}
              onCheckedChange={onDefaultChange}
            />
            Услуга по умолчанию
          </label>
        </div>
      </div>
    </DoctorModal>
  );
}
