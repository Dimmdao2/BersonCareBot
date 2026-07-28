'use client';

import Link from 'next/link';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { routePaths } from '@/app-layer/routes/paths';
import type { PatientOrganizationSummary } from '@/modules/patient-organization/service';
import { Button } from '@/shared/ui/patient/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/patient/primitives/select';

export type PatientOrganizationClientContext = {
  organization: PatientOrganizationSummary;
  organizations: PatientOrganizationSummary[];
  switchOrganization(organizationId: string): Promise<void>;
  switching: boolean;
  contextChangeNotice: boolean;
};

const Context = createContext<PatientOrganizationClientContext | null>(null);

const SAFE_PATIENT_DESTINATION = routePaths.patient;

type PatientOrganizationNavigate = (href: string) => void;

function replacePatientLocation(href: string): void {
  window.location.replace(href);
}

function isContextReceiptResponse(value: unknown): value is { contextChanged: boolean } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'contextChanged' in value &&
    typeof value.contextChanged === 'boolean',
  );
}

export function usePatientOrganizationContext(): PatientOrganizationClientContext | null {
  return useContext(Context);
}

export function PatientOrganizationContextProvider({
  organization,
  organizations,
  rememberOrganizationOnMount = false,
  checkContextChangeReceipt = true,
  navigate = replacePatientLocation,
  children,
}: {
  organization: PatientOrganizationSummary;
  organizations: PatientOrganizationSummary[];
  rememberOrganizationOnMount?: boolean;
  checkContextChangeReceipt?: boolean;
  navigate?: PatientOrganizationNavigate;
  children: ReactNode;
}) {
  const [switching, setSwitching] = useState(false);
  const [contextChangeNotice, setContextChangeNotice] = useState(false);
  const switchingRef = useRef(false);
  const rememberStartedRef = useRef(false);
  const pathname = usePathname();
  const noticePathRef = useRef(pathname);

  useEffect(() => {
    if (!checkContextChangeReceipt) return;
    let active = true;
    void fetch('/api/patient/organization-context', { method: 'GET', cache: 'no-store' })
      .then((response) => response.json() as Promise<unknown>)
      .then((body) => {
        if (active && isContextReceiptResponse(body)) setContextChangeNotice(body.contextChanged);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [checkContextChangeReceipt]);

  useEffect(() => {
    if (noticePathRef.current === pathname) return;
    noticePathRef.current = pathname;
    setContextChangeNotice(false);
  }, [pathname]);

  useEffect(() => {
    if (!rememberOrganizationOnMount || rememberStartedRef.current) return;
    rememberStartedRef.current = true;
    void fetch('/api/patient/organization-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId: organization.organizationId }),
    }).catch(() => undefined);
  }, [organization.organizationId, rememberOrganizationOnMount]);

  const value = useMemo<PatientOrganizationClientContext>(
    () => ({
      organization,
      organizations,
      switching,
      contextChangeNotice,
      async switchOrganization(organizationId) {
        if (switchingRef.current || organizationId === organization.organizationId) return;
        switchingRef.current = true;
        setSwitching(true);
        try {
          const response = await fetch('/api/patient/organization-context', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ organizationId }),
          });
          if (!response.ok) throw new Error('organization_switch_failed');
          navigate(SAFE_PATIENT_DESTINATION);
        } catch {
          switchingRef.current = false;
          setSwitching(false);
          navigate(`${routePaths.patientOrganizations}?unavailable=1`);
        }
      },
    }),
    [contextChangeNotice, navigate, organization, organizations, switching],
  );

  return (
    <Context.Provider value={value}>
      {switching ? (
        <div className="flex min-h-[50vh] items-center justify-center px-4 text-center text-sm text-[var(--patient-text-secondary)]">
          Переключаем организацию…
        </div>
      ) : (
        children
      )}
    </Context.Provider>
  );
}

export function PatientOrganizationContextBar() {
  const context = usePatientOrganizationContext();
  if (!context) return null;
  const multiple = context.organizations.length > 1;
  return (
    <div className="grid w-full min-w-0 shrink-0 gap-2 patient-shell-above-slot-pad">
      <div
        className="mx-auto flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-[var(--patient-border)] bg-white/95 px-3 py-2 text-sm shadow-sm"
        data-testid="patient-organization-context"
      >
        <Link
          href={routePaths.patientOrganizations}
          className="min-w-0 truncate text-[var(--patient-text-secondary)] underline-offset-4 hover:underline"
        >
          Организация
        </Link>
        {multiple ? (
          <Select
            value={context.organization.organizationId}
            disabled={context.switching}
            onValueChange={(organizationId) => {
              if (organizationId) void context.switchOrganization(organizationId);
            }}
          >
            <SelectTrigger
              aria-label="Текущая организация"
              className="min-w-0 max-w-[70%] bg-white font-medium text-[var(--patient-text-primary)]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {context.organizations.map((organization) => (
                <SelectItem key={organization.organizationId} value={organization.organizationId}>
                  {organization.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span
            className="min-w-0 truncate font-medium text-[var(--patient-text-primary)]"
            title={context.organization.title}
          >
            {context.organization.title}
          </span>
        )}
      </div>
      {context.contextChangeNotice ? (
        <div
          role="status"
          className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-950"
          data-testid="patient-organization-changed-notice"
        >
          Открыта организация «{context.organization.title}».{' '}
          <Link
            href={routePaths.patientOrganizations}
            className="font-medium underline underline-offset-4"
          >
            Выбрать другую
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function PatientOrganizationRecoveryScreen({
  organizations,
  invalidRememberedOrganization,
  navigate = replacePatientLocation,
}: {
  organizations: PatientOrganizationSummary[];
  invalidRememberedOrganization?: boolean;
  navigate?: PatientOrganizationNavigate;
}) {
  const [pending, setPending] = useState<string | null>(null);

  async function select(organizationId: string) {
    if (pending) return;
    setPending(organizationId);
    try {
      const response = await fetch('/api/patient/organization-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId }),
      });
      if (!response.ok) throw new Error('organization_selection_failed');
      navigate(routePaths.patient);
    } catch {
      navigate(`${routePaths.patientOrganizations}?unavailable=1`);
    }
  }

  return (
    <main className="mx-auto flex min-h-[65vh] w-full max-w-lg flex-col justify-center gap-4 px-4 py-8">
      <h1 className="text-xl font-semibold text-[var(--patient-text-primary)]">
        {organizations.length > 0 ? 'Выберите организацию' : 'Нет активного сопровождения'}
      </h1>
      <p className="text-sm text-[var(--patient-text-secondary)]">
        {organizations.length > 0
          ? 'Данные будут показаны только после подтверждения доступной организации.'
          : 'Сейчас у аккаунта нет активной связи с организацией. Обратитесь к своему специалисту.'}
      </p>
      {invalidRememberedOrganization ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Ранее выбранная организация больше недоступна. Выберите другую.
        </p>
      ) : null}
      <div className="grid gap-2">
        {organizations.map((organization) => (
          <Button
            key={organization.organizationId}
            type="button"
            variant="outline"
            disabled={pending !== null}
            onClick={() => void select(organization.organizationId)}
            className="h-auto min-h-11 justify-start rounded-xl px-4 py-3 text-left font-medium"
          >
            {pending === organization.organizationId ? 'Открываем…' : organization.title}
          </Button>
        ))}
      </div>
    </main>
  );
}
