import Link from "next/link";
import { routePaths } from "@/app-layer/routes/paths";
import { cn } from "@/lib/utils";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from "@/shared/ui/doctor/DoctorSection";
import { buttonVariants } from "@/shared/ui/doctor/primitives/button-variants";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";
import { loadManagementWorkspace } from "./loadManagementWorkspace";

function managementRoleLabel(role: "owner" | "admin" | "doctor" | "assistant"): string {
  if (role === "owner") return "Владелец практики";
  if (role === "admin") return "Администратор практики";
  return "Управление практикой";
}

export default async function ManagementPage() {
  const { workspace, organizationName, clinicTeamEnabled } = await loadManagementWorkspace();
  const hasClinicalWorkspace = workspace.canAccessClinicalWorkspace && workspace.specialistId !== null;
  const canAccessBilling = workspace.membershipRole === "owner";

  return (
    <DoctorAppShell title="Управление практикой" user={workspace.session.user}>
      <DoctorPageHeader title="Управление практикой" subtitle={`Практика · ${organizationName}`} />

      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Доступ</DoctorSectionTitle>
        </DoctorSectionHeader>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-md border border-border/70 bg-muted/15 px-3 py-2">
            <dt className="text-xs text-muted-foreground">Роль</dt>
            <dd className="font-medium text-foreground">{managementRoleLabel(workspace.membershipRole)}</dd>
          </div>
          <div className="rounded-md border border-border/70 bg-muted/15 px-3 py-2">
            <dt className="text-xs text-muted-foreground">Рабочий кабинет</dt>
            <dd className="font-medium text-foreground">
              {hasClinicalWorkspace ? "Подключён" : "Не подключён"}
            </dd>
          </div>
        </dl>
      </DoctorSection>

      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Разделы</DoctorSectionTitle>
        </DoctorSectionHeader>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`${routePaths.settings}?tab=organization`}
            className={cn(buttonVariants({ size: "sm" }))}
          >
            Настройки практики
          </Link>
          <Link
            href={routePaths.account}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Личный аккаунт
          </Link>
          {clinicTeamEnabled ? (
            <Link
              href={`${routePaths.settings}?tab=team`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Команда
            </Link>
          ) : null}
          {canAccessBilling ? (
            <Link
              href={`${routePaths.settings}?tab=billing`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Тариф и биллинг
            </Link>
          ) : null}
          {hasClinicalWorkspace ? (
            <>
              <Link
                href={routePaths.doctor}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Рабочий кабинет
              </Link>
              <Link
                href={`${routePaths.doctorSchedule}?tab=setup`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Настройки записи
              </Link>
            </>
          ) : null}
        </div>
      </DoctorSection>
    </DoctorAppShell>
  );
}
