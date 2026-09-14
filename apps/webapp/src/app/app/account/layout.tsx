import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import '../../styles/doctor.css';
import { logger } from '@/app-layer/logging/logger';
import { DoctorWorkspaceShell } from '@/shared/ui/doctor/shell/DoctorWorkspaceShell';
import { buildDoctorWorkspaceShellData } from '../doctor/loadDoctorWorkspaceShell';
import type { DoctorWorkspaceShellData } from '../doctor/loadDoctorWorkspaceShell';
import { loadStaffAccountPageContext } from './accountContext';

/**
 * Оболочка страницы учётки — ТА ЖЕ, что у остальных разделов кабинета.
 *
 * Владелец 14.09.2026: «выбирая в меню настройку учетки соло специалист перестает видеть кучу
 * пунктов меню, причем непонятно по какому принципу». Принцип был в том, что эта страница собирала
 * оболочку своим урезанным контекстом: меню одно, а входные данные другие — и пропадало всё, что
 * зависит от тарифа и состава кабинета («Задачи», «Файлы», «Контент», «Курсы», настройки соло), а
 * термин организации «Клиенты» откатывался к умолчанию «Пациенты».
 *
 * Отказ общей сборки НЕ закрывает страницу: учётка личная, и попасть в неё нужно в том числе тогда,
 * когда с кабинетом что-то не так (отозван доступ, тариф, блокировка). Тогда рисуем прежнюю
 * минимальную оболочку и говорим об этом в лог — молча обеднять меню нельзя, это и был исходный
 * дефект.
 */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const { session, workspaceContext, workspaceAccess } = await loadStaffAccountPageContext();
  const isPlatformConsole = session.user.role === 'admin';
  if (isPlatformConsole) redirect('/app/admin');

  let shell: DoctorWorkspaceShellData | null = null;
  if (workspaceAccess) {
    try {
      shell = await buildDoctorWorkspaceShellData(workspaceAccess);
    } catch (error) {
      logger.warn(
        { err: error, organizationId: workspaceAccess.organizationId },
        '[account layout] workspace shell unavailable, falling back to the personal-only shell',
      );
    }
  }

  /* Тот же выбор меню, что и на остальных страницах: у клиники-администратора — меню управления. */
  const managementMode =
    shell !== null &&
    shell.workspaceContext.canManageOrganization &&
    shell.workspaceComposition === 'clinic';

  return (
    <DoctorWorkspaceShell
      isPlatformOperator={isPlatformConsole}
      menuKind={isPlatformConsole ? 'platform' : managementMode ? 'management' : 'doctor'}
      userRole={session.user.role}
      userDisplayName={session.user.displayName}
      workspaceContext={shell?.workspaceContext ?? workspaceContext ?? undefined}
      enableTenantRuntime={workspaceContext !== null}
      {...(shell
        ? {
            patientLabel: shell.patientLabel,
            supportGroupLabel: shell.supportGroupLabel,
            appointmentLabel: shell.appointmentLabel,
            workspaceComposition: shell.workspaceComposition,
            coursesEnabled: shell.coursesEnabled,
            promoEnabled: shell.promoEnabled,
            cmsEnabled: shell.cmsEnabled,
            patientHomeTodayEnabled: shell.patientHomeTodayEnabled,
            specialistTasksEnabled: shell.specialistTasksEnabled,
            workspaceModules: shell.workspaceModules,
            communicationsSurface: shell.communicationsSurface,
            brand: shell.shellBrand,
          }
        : {})}
    >
      {children}
    </DoctorWorkspaceShell>
  );
}
