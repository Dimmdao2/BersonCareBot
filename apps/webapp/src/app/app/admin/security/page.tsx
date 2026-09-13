/**
 * `/app/admin/security` — «Безопасность» админа платформы: с каких устройств входили в ЕГО учётную
 * запись (#1112, этап Л-6в).
 *
 * Решение владельца 13.09 о порядке раскатки, дословно: «для начала для админа, наверное, имеет
 * смысл сделать и посмотреть, как это будет работать. Для специалист, когда поймём, что всё
 * работает, тогда уже там можно выкладывать, там, и решать уже делать это для пациентов или нет».
 * 14.09 владелец раскатку продолжил: «раскатывай в Учетку -> Безопасность» — тот же список устройств
 * теперь есть у специалиста во вкладке «Безопасность» (`/app/account?tab=security`). Отображение у
 * них общее (`shared/ui/security/LoginDevicesCard`), различается только то, что вокруг.
 *
 * Показываются только СВОИ входы: `session.user.userId`. Чужие разбираются на экране входов, и туда
 * ведёт отдельный путь из журнала операций.
 */
import { requirePlatformOperationsPage } from '@/app-layer/guards/requireRole';
import { loadOwnLoginDevices } from '@/app-layer/identity/ownLoginDevices';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { LoginDevicesCard } from '@/shared/ui/security/LoginDevicesCard';
import { AdminSecurityRevokeCard } from './AdminSecurityClient';

export default async function AdminSecurityPage() {
  const session = await requirePlatformOperationsPage();
  const { devices, loadFailed } = await loadOwnLoginDevices();

  return (
    <DoctorAppShell title="Безопасность" user={session.user}>
      <DoctorPageHeader title="Безопасность" />
      <div className="flex flex-col gap-3">
        <LoginDevicesCard devices={devices} loadFailed={loadFailed} />
        <AdminSecurityRevokeCard />
      </div>
    </DoctorAppShell>
  );
}
