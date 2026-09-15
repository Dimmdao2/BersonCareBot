'use client';

import Link from 'next/link';
import { Settings } from 'lucide-react';
import { useCallback, useState } from 'react';
import { routePaths } from '@/app-layer/routes/paths';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { buttonVariants } from '@/shared/ui/doctor/primitives/button';
import { BroadcastsTab } from '../communications/tabs/BroadcastsTab';

type DoctorBroadcastsShellProps = {
  initialArchiveOpen: boolean;
  mailingsMutationAvailable: boolean;
};

export function DoctorBroadcastsShell({
  initialArchiveOpen,
  mailingsMutationAvailable,
}: DoctorBroadcastsShellProps) {
  const [archiveOpen, setArchiveOpen] = useState(initialArchiveOpen);
  const handleArchiveChange = useCallback((key: string, value: string | null) => {
    if (key !== 'archive') return;
    const open = value === '1';
    setArchiveOpen(open);
    window.history.replaceState(
      null,
      '',
      open ? `${routePaths.doctorBroadcasts}?archive=1` : routePaths.doctorBroadcasts,
    );
  }, []);

  return (
    <DoctorAppShell title="Рассылки" layout="full-height">
      <DoctorPageHeader
        id="doctor-broadcasts-header"
        title="Рассылки"
        info={
          <Link
            href="/app/settings?tab=branding#clinic-delivery-channels"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Settings aria-hidden className="size-4" />
            Настройки уведомлений
          </Link>
        }
      />
      <BroadcastsTab
        deepLinkParams={archiveOpen ? { archive: '1' } : {}}
        onDeepLinkChange={handleArchiveChange}
        mailingsMutationAvailable={mailingsMutationAvailable}
      />
    </DoctorAppShell>
  );
}
