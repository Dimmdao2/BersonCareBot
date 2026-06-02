"use client";

import { useState } from "react";
import { AdminDangerActions } from "./AdminDangerActions";
import { AdminMergeAccountsPanel } from "./AdminMergeAccountsPanel";
import { AdminClientAuditHistorySection } from "./AdminClientAuditHistorySection";

type Props = {
  userId: string;
  isAdmin: boolean;
  canPermanentDelete: boolean;
  sampleRecordId: string | null;
};

export function DoctorClientCardAdminSection({
  userId,
  isAdmin,
  canPermanentDelete,
  sampleRecordId,
}: Props) {
  const [adminDetailsOpen, setAdminDetailsOpen] = useState(false);

  if (!isAdmin && !canPermanentDelete) {
    return null;
  }

  return (
    <details
      className="rounded-lg border border-border bg-card shadow-sm"
      onToggle={(e) => setAdminDetailsOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        Админ
      </summary>
      <div className="flex flex-col gap-4 border-t border-border px-4 pb-4 pt-4">
        {isAdmin ? <AdminDangerActions userId={userId} sampleIntegratorRecordId={sampleRecordId} /> : null}
        {canPermanentDelete ? (
          <AdminMergeAccountsPanel anchorUserId={userId} enabled suspendHeavyFetch={!adminDetailsOpen} />
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
