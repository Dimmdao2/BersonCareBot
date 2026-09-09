'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

import { patientCardHref } from '@/app/app/doctor/patients/patientCardHref';
import { PatientPackageSessionsList } from '@/app/app/doctor/clients/PatientPackageSessionsList';
import { apiJson } from '@/shared/lib/apiJson';
import { cn } from '@/lib/utils';
import { formatPatientPackageShortLabel } from '@/modules/memberships/display';
import type { PatientPackageListItem, PatientPackageStatus } from '@/modules/memberships/types';
import { Badge } from '@/shared/ui/doctor/primitives/badge';
import { Button } from '@/shared/ui/doctor/primitives/button';
import {
  DoctorDnaFlatList,
  doctorDnaFlatListClickableClass,
  doctorDnaFlatListRowClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
import { DoctorModal, DoctorModalStackedTitle } from '@/shared/ui/doctor/DoctorModal';
import { DoctorModalSummaryBar } from '@/shared/ui/doctor/DoctorModalSummaryBar';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';

export type DoctorSoldMembership = PatientPackageListItem & { patientDisplayName: string };

function formatMoney(priceMinor: number, currency = 'RUB'): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(priceMinor / 100);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('ru-RU');
}

function statusLabel(status: PatientPackageStatus): string {
  if (status === 'active') return 'Активен';
  if (status === 'expired') return 'Истёк';
  if (status === 'cancelled') return 'Закрыт';
  if (status === 'awaiting_payment') return 'Ожидает оплаты';
  if (status === 'offered') return 'Не активирован';
  return status;
}

function sessionsLabel(value: number): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'сеансов';
  if (mod10 === 1) return 'сеанс';
  if (mod10 >= 2 && mod10 <= 4) return 'сеанса';
  return 'сеансов';
}

function totalSessions(pkg: DoctorSoldMembership): number {
  return pkg.balance.items.reduce((sum, item) => sum + item.quantityInitial, 0);
}

function paymentLabel(pkg: DoctorSoldMembership): string {
  if (pkg.status === 'awaiting_payment') return 'Ожидает оплаты';
  if (pkg.paidAmountMinor === 0) return 'Без оплаты';
  if (pkg.paymentIntentId) return 'Онлайн';
  if (pkg.paidAmountMinor !== null) return 'В клинике';
  return '—';
}

type State =
  { phase: 'idle' | 'loading' | 'error' } | { phase: 'ready'; packages: DoctorSoldMembership[] };

export function DoctorSoldMembershipsModal({
  open,
  onOpenChange,
  readOnly = false,
  onPackagesLoaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readOnly?: boolean;
  onPackagesLoaded?: (packages: DoctorSoldMembership[]) => void;
}) {
  const [state, setState] = useState<State>({ phase: 'idle' });
  const [selected, setSelected] = useState<DoctorSoldMembership | null>(null);

  const load = useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const json = await apiJson<{ ok: boolean; packages: DoctorSoldMembership[] }>(
        '/api/doctor/booking-engine/patient-packages/sold',
      );
      setState({ phase: 'ready', packages: json.packages });
      onPackagesLoaded?.(json.packages);
    } catch {
      setState({ phase: 'error' });
    }
  }, [onPackagesLoaded]);

  useEffect(() => {
    if (open && state.phase === 'idle') void load();
  }, [load, open, state.phase]);

  const packages = state.phase === 'ready' ? state.packages : [];
  const selectedTotal = selected ? totalSessions(selected) : 0;
  const selectedRemaining = selected
    ? selected.balance.items.reduce((sum, item) => sum + item.displayRemaining, 0)
    : 0;
  const selectedReserved = selected
    ? selected.balance.items.reduce((sum, item) => sum + item.reserved, 0)
    : 0;

  return (
    <>
      <DoctorModal
        open={open}
        onClose={() => {
          onOpenChange(false);
          setSelected(null);
        }}
        title="Проданные абонементы"
        bodyVariant="list"
        desktopPresentation="right-sheet"
        bodyHeader={
          state.phase === 'ready' ? (
            <DoctorModalSummaryBar>Всего {packages.length}</DoctorModalSummaryBar>
          ) : undefined
        }
      >
        {state.phase === 'loading' || state.phase === 'idle' ? (
          <DoctorPanelLoading className="py-8" />
        ) : state.phase === 'error' ? (
          <div className="flex items-center gap-2 px-4 py-4">
            <p className="text-sm text-destructive">Не удалось загрузить абонементы</p>
            <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
              Повторить
            </Button>
          </div>
        ) : packages.length > 0 ? (
          <DoctorDnaFlatList>
            {packages.map((pkg) => {
              const count = totalSessions(pkg);
              return (
                <li key={pkg.id}>
                  <button
                    type="button"
                    className={cn(
                      doctorDnaFlatListRowClass,
                      doctorDnaFlatListClickableClass,
                      'grid w-full grid-cols-[minmax(0,1fr)_auto] text-left',
                    )}
                    onClick={() => setSelected(pkg)}
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-base text-foreground">
                        {pkg.patientDisplayName}
                      </span>
                      <span className="truncate text-sm text-foreground/80">{pkg.title}</span>
                      <span className="text-sm text-foreground/80">
                        Продан {formatDate(pkg.soldAt ?? pkg.createdAt)} · до{' '}
                        {formatDate(pkg.validUntil)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="flex flex-col items-end gap-0.5 text-sm">
                        <span>{formatMoney(pkg.priceMinor, pkg.currency)}</span>
                        <span className="text-muted-foreground">
                          {count} {sessionsLabel(count)}
                        </span>
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </span>
                  </button>
                </li>
              );
            })}
          </DoctorDnaFlatList>
        ) : (
          <DoctorEmptyState>Проданных абонементов нет</DoctorEmptyState>
        )}
      </DoctorModal>

      <DoctorModal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={
          <DoctorModalStackedTitle
            label="Абонемент"
            patientName={selected?.patientDisplayName}
            patientHref={selected ? patientCardHref(selected.platformUserId) : null}
          />
        }
        nested
        desktopPresentation="right-sheet"
      >
        {selected ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-medium text-foreground">{selected.title}</p>
              <Badge variant="outline">{statusLabel(selected.status)}</Badge>
              <Badge variant="secondary">
                {formatPatientPackageShortLabel(selected.displayNumber)}
              </Badge>
            </div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Продан</dt>
              <dd>{formatDate(selected.soldAt ?? selected.createdAt)}</dd>
              <dt className="text-muted-foreground">Стоимость</dt>
              <dd>{formatMoney(selected.priceMinor, selected.currency)}</dd>
              <dt className="text-muted-foreground">Оплата</dt>
              <dd>{paymentLabel(selected)}</dd>
              <dt className="text-muted-foreground">Действует до</dt>
              <dd>{formatDate(selected.validUntil)}</dd>
              <dt className="text-muted-foreground">Использовано</dt>
              <dd>
                {selectedTotal - selectedRemaining} из {selectedTotal}
              </dd>
              <dt className="text-muted-foreground">Зарезервировано</dt>
              <dd>{selectedReserved}</dd>
            </dl>
            <div className="space-y-2">
              <p className="text-sm font-medium">Состав</p>
              <ul className="m-0 list-none space-y-1 p-0">
                {selected.balance.items.map((item) => (
                  <li
                    key={item.patientPackageItemId}
                    className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2 text-sm"
                  >
                    <span>{item.serviceTitle ?? 'Услуга'}</span>
                    <span className="text-muted-foreground">
                      осталось {item.displayRemaining} из {item.quantityInitial}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {selected.notes?.trim() ? (
              <div className="space-y-1">
                <p className="text-sm font-medium">Комментарий</p>
                <p className="whitespace-pre-wrap text-sm text-foreground/80">
                  {selected.notes.trim()}
                </p>
              </div>
            ) : null}
            <div className="border-t border-border/60 pt-4">
              <PatientPackageSessionsList
                packageId={selected.id}
                apiBase="/api/doctor/booking-engine/patient-packages"
                mutationsAllowed={!readOnly}
                nestedModals
                onChanged={() => void load()}
                onError={() => toast.error('Не удалось обновить абонемент')}
              />
            </div>
          </div>
        ) : null}
      </DoctorModal>
    </>
  );
}
