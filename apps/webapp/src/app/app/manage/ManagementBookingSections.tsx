'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ScheduleSetupTab } from '@/app/app/doctor/schedule/tabs/ScheduleSetupTab';

const MANAGEMENT_BOOKING_SECTIONS = new Set([
  'locations',
  'services',
  'specialists',
  'form',
  'rules',
  'notifications',
  'packages',
]);

/**
 * One client entry into the canonical booking writers, parameterised instead of copied: clinic
 * management mounts it under `/app/manage`, the solo settings hub under `/app/settings?tab=booking`
 * (owner ruling 2026-09-10 — solo keeps every setting in one place, without a cabinet-mode switch).
 * The query string is carried over untouched apart from `section`, so the caller's own params
 * (e.g. `tab=booking`) survive section navigation.
 */
export function ManagementBookingSections({
  defaultSection = 'locations',
  basePath = '/app/manage',
  packagesVisible = true,
  packagesReadOnly = false,
  notificationTemplatesVisible = true,
  doctorStatisticsEnabled = false,
}: {
  defaultSection?: string;
  basePath?: string;
  packagesVisible?: boolean;
  packagesReadOnly?: boolean;
  notificationTemplatesVisible?: boolean;
  doctorStatisticsEnabled?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const section = searchParams.get('section') ?? defaultSection;
  if (!MANAGEMENT_BOOKING_SECTIONS.has(section)) return null;

  return (
    <ScheduleSetupTab
      deepLinkParams={{ section }}
      onDeepLinkChange={(key, value) => {
        if (key !== 'section') return;
        const next = new URLSearchParams(searchParams.toString());
        if (value === null) next.delete('section');
        else next.set('section', value);
        router.replace(`${basePath}${next.size ? `?${next.toString()}` : ''}`);
      }}
      isActive
      packagesVisible={packagesVisible}
      packagesReadOnly={packagesReadOnly}
      notificationTemplatesVisible={notificationTemplatesVisible}
      doctorStatisticsEnabled={doctorStatisticsEnabled}
    />
  );
}
