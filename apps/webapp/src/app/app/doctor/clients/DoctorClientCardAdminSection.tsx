'use client';

import { useState } from 'react';
import { AdminMergeAccountsPanel } from './AdminMergeAccountsPanel';
import { AdminClientAuditHistorySection } from './AdminClientAuditHistorySection';
import {
  doctorClientPanelStackClass,
  doctorClientProfileCardClass,
  doctorClientSectionTitleClass,
} from './doctorClientCardChrome';

type Props = {
  userId: string;
  canPermanentDelete: boolean;
};

export function DoctorClientCardAdminSection({
  userId,
  canPermanentDelete,
}: Props) {
  const [adminDetailsOpen, setAdminDetailsOpen] = useState(false);

  if (!canPermanentDelete) {
    return null;
  }

  return (
    <details
      className={doctorClientProfileCardClass}
      onToggle={(e) => setAdminDetailsOpen(e.currentTarget.open)}
    >
      <summary
        className={`cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden ${doctorClientSectionTitleClass}`}
      >
        Админ
      </summary>
      <div className={`border-t border-border px-4 pb-4 pt-4 ${doctorClientPanelStackClass}`}>
        {canPermanentDelete ? (
          <AdminMergeAccountsPanel
            anchorUserId={userId}
            enabled
            suspendHeavyFetch={!adminDetailsOpen}
          />
        ) : null}
        {canPermanentDelete ? (
          <AdminClientAuditHistorySection
            platformUserId={userId}
            enabled
            suspendLoad={!adminDetailsOpen}
          />
        ) : null}
      </div>
    </details>
  );
}
