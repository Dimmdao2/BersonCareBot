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

export function ManagementBookingSections({
  defaultSection = 'locations',
  basePath = '/app/manage',
}: {
  defaultSection?: string;
  basePath?: string;
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
      packagesVisible
      packagesReadOnly={false}
      notificationTemplatesVisible
      doctorStatisticsEnabled={false}
    />
  );
}
