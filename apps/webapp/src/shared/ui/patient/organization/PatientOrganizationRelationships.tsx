"use client";

import { useRef, useState } from "react";
import type { PatientOrganizationSummary } from "@/modules/patient-organization/service";
import { routePaths } from "@/app-layer/routes/paths";
import { Button } from "@/shared/ui/patient/primitives/button";

type Navigate = (href: string) => void;

function replaceLocation(href: string): void {
  window.location.replace(href);
}

export function PatientOrganizationRelationships({
  organizations,
  currentOrganizationId,
  invalidRememberedOrganization = false,
  destinationUnavailable = false,
  reminderTargetMissing = false,
  navigate = replaceLocation,
}: {
  organizations: PatientOrganizationSummary[];
  currentOrganizationId: string | null;
  invalidRememberedOrganization?: boolean;
  destinationUnavailable?: boolean;
  reminderTargetMissing?: boolean;
  navigate?: Navigate;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const pendingRef = useRef(false);

  async function select(organizationId: string) {
    if (pendingRef.current || organizationId === currentOrganizationId) return;
    pendingRef.current = true;
    setPending(organizationId);
    try {
      const response = await fetch("/api/patient/organization-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      if (!response.ok) throw new Error("organization_switch_failed");
      navigate(routePaths.patient);
    } catch {
      navigate(`${routePaths.patientOrganizations}?unavailable=1`);
    }
  }

  return (
    <div className="grid gap-3">
      {invalidRememberedOrganization || destinationUnavailable || reminderTargetMissing ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {reminderTargetMissing
            ? "Не удалось определить организацию из этой ссылки. Выберите её вручную."
            : "Ранее выбранная организация больше недоступна. Выберите доступную."}
        </p>
      ) : null}

      {organizations.length > 0 ? (
        <div className="grid gap-2" aria-label="Доступные организации">
          {organizations.map((organization) => {
            const current = organization.organizationId === currentOrganizationId;
            return (
              <div
                key={organization.organizationId}
                className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-[var(--patient-border)] bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--patient-text-primary)]">{organization.title}</p>
                  <p className="text-sm text-[var(--patient-text-secondary)]">
                    {current ? "Открыта сейчас" : "Активная связь"}
                  </p>
                </div>
                {current ? (
                  <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-900">
                    Текущая
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending !== null}
                    onClick={() => void select(organization.organizationId)}
                    className="shrink-0"
                  >
                    {pending === organization.organizationId ? "Открываем…" : "Открыть"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--patient-border)] bg-white px-4 py-4">
          <p className="font-medium text-[var(--patient-text-primary)]">Нет активных организаций</p>
          <p className="mt-1 text-sm text-[var(--patient-text-secondary)]">
            Обратитесь к специалисту или клинике, чтобы восстановить сопровождение.
          </p>
        </div>
      )}

      <p className="text-sm text-[var(--patient-text-secondary)]">
        Недоступные и завершённые связи не открывают медицинские данные. Если нужной организации нет в списке,
        обратитесь к ней напрямую.
      </p>
    </div>
  );
}
