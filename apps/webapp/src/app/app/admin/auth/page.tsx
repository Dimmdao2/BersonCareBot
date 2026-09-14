import { requireAdminDoctorPage } from '@/app/app/settings/requireAdminDoctorPage';
import { loadAdminAuthPageData } from '@/app/app/settings/adminSettingsData';
import { AuthProvidersSection } from '@/app/app/settings/AuthProvidersSection';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { PlatformAuthChannelPolicySection } from './PlatformAuthChannelPolicySection';
import { LoginCaptchaSection } from './LoginCaptchaSection';

export default async function DoctorAdminAuthPage() {
  await requireAdminDoctorPage();
  const { authProvidersConfig, loginCaptchaConfig } = await loadAdminAuthPageData();

  return (
    <DoctorAppShell title="Авторизация">
      <DoctorPageHeader title="Авторизация" />
      <PlatformAuthChannelPolicySection />
      <LoginCaptchaSection {...loginCaptchaConfig} />
      <AuthProvidersSection {...authProvidersConfig} />
    </DoctorAppShell>
  );
}
