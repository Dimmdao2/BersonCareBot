"use client";

import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { PatientOrganizationSummary } from "@/modules/patient-organization/service";
import { Button } from "@/shared/ui/patient/primitives/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/shared/ui/patient/primitives/select";

export type PatientOrganizationClientContext = {
  organization: PatientOrganizationSummary;
  organizations: PatientOrganizationSummary[];
  switchOrganization(organizationId: string): Promise<void>;
  switching: boolean;
};

const Context = createContext<PatientOrganizationClientContext | null>(null);

export function usePatientOrganizationContext(): PatientOrganizationClientContext | null {
  return useContext(Context);
}

export function PatientOrganizationContextProvider({
  organization,
  organizations,
  children,
}: {
  organization: PatientOrganizationSummary;
  organizations: PatientOrganizationSummary[];
  children: ReactNode;
}) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const switchingRef = useRef(false);

  const value = useMemo<PatientOrganizationClientContext>(
    () => ({
      organization,
      organizations,
      switching,
      async switchOrganization(organizationId) {
        if (switchingRef.current || organizationId === organization.organizationId) return;
        switchingRef.current = true;
        setSwitching(true);
        try {
          const response = await fetch("/api/patient/organization-context", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ organizationId }),
          });
          if (!response.ok) throw new Error("organization_switch_failed");
          window.location.reload();
        } catch {
          switchingRef.current = false;
          setSwitching(false);
          router.push("/app/patient");
          router.refresh();
        }
      },
    }),
    [organization, organizations, router, switching],
  );

  return (
    <Context.Provider value={value}>
      {switching ?
        <div className="flex min-h-[50vh] items-center justify-center px-4 text-center text-sm text-[var(--patient-text-secondary)]">
          Переключаем организацию…
        </div>
      : children}
    </Context.Provider>
  );
}

export function PatientOrganizationContextBar() {
  const context = usePatientOrganizationContext();
  if (!context) return null;
  const multiple = context.organizations.length > 1;
  return (
    <div
      className="mx-auto flex w-full min-w-0 shrink-0 items-center justify-between gap-2 rounded-xl border border-[var(--patient-border)] bg-white/95 px-3 py-2 text-sm shadow-sm patient-shell-above-slot-pad"
      data-testid="patient-organization-context"
    >
      <span className="min-w-0 truncate text-[var(--patient-text-secondary)]">Организация</span>
      {multiple ?
        <Select
          value={context.organization.organizationId}
          disabled={context.switching}
          onValueChange={(organizationId) => {
            if (organizationId) void context.switchOrganization(organizationId);
          }}
        >
          <SelectTrigger
            aria-label="Текущая организация"
            displayLabel={context.organization.title}
            className="min-w-0 max-w-[70%] bg-white font-medium text-[var(--patient-text-primary)]"
          />
          <SelectContent align="end">
            {context.organizations.map((organization) => (
              <SelectItem key={organization.organizationId} value={organization.organizationId}>
                {organization.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      : <span className="min-w-0 truncate font-medium text-[var(--patient-text-primary)]" title={context.organization.title}>
          {context.organization.title}
        </span>}
    </div>
  );
}

export function PatientOrganizationRecoveryScreen({
  organizations,
  invalidRememberedOrganization,
}: {
  organizations: PatientOrganizationSummary[];
  invalidRememberedOrganization?: boolean;
}) {
  const [pending, setPending] = useState<string | null>(null);

  async function select(organizationId: string) {
    if (pending) return;
    setPending(organizationId);
    const response = await fetch("/api/patient/organization-context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    if (response.ok) {
      window.location.assign("/app/patient");
      return;
    }
    setPending(null);
  }

  return (
    <main className="mx-auto flex min-h-[65vh] w-full max-w-lg flex-col justify-center gap-4 px-4 py-8">
      <h1 className="text-xl font-semibold text-[var(--patient-text-primary)]">
        {organizations.length > 0 ? "Выберите организацию" : "Нет активного сопровождения"}
      </h1>
      <p className="text-sm text-[var(--patient-text-secondary)]">
        {organizations.length > 0
          ? "Данные будут показаны только после подтверждения доступной организации."
          : "Сейчас у аккаунта нет активной связи с организацией. Обратитесь к своему специалисту."}
      </p>
      {invalidRememberedOrganization ?
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Ранее выбранная организация больше недоступна. Выберите другую.
        </p>
      : null}
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
            {pending === organization.organizationId ? "Открываем…" : organization.title}
          </Button>
        ))}
      </div>
    </main>
  );
}
