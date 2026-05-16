"use client";

import Link from "next/link";
import {
  isMergeAuditAction,
  isMessengerPhoneBindAuditAction,
  parseMergeAuditDetails,
  parseMessengerPhoneBindAuditTargets,
} from "@/infra/adminAuditLogPresentation";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(s: string | null): boolean {
  return s != null && s.length > 0 && UUID_RE.test(s);
}

type Row = {
  action: string;
  target_id: string | null;
  details: Record<string, unknown> | null | undefined;
};

/**
 * Для merge-записей: цель — канон сверху, дубликат снизу (ФИО из details, иначе UUID).
 */
export function AuditLogMergeTarget({ row }: { row: Row }) {
  const details = row.details ?? null;
  if (isMergeAuditAction(row.action)) {
    const m = parseMergeAuditDetails(details, row.target_id);
    if (m) {
      const top = m.targetDisplayName ?? m.targetId;
      const bottom = m.duplicateDisplayName ?? m.duplicateId;
      return (
        <div className="flex flex-col gap-0.5 font-sans text-xs break-words">
          <Link href={`/app/doctor/clients/${encodeURIComponent(m.targetId)}`} className="text-primary underline-offset-2 hover:underline">
            {top}
          </Link>
          <Link
            href={`/app/doctor/clients/${encodeURIComponent(m.duplicateId)}`}
            className="text-muted-foreground underline-offset-2 hover:underline"
          >
            {bottom}
          </Link>
        </div>
      );
    }
  }

  if (isMessengerPhoneBindAuditAction(row.action)) {
    const mb = parseMessengerPhoneBindAuditTargets(details);
    if (mb && mb.length >= 2) {
      const top = mb[0];
      const bottom = mb[1];
      return (
        <div className="flex flex-col gap-0.5 font-sans text-xs break-words">
          <Link
            href={`/app/doctor/clients/${encodeURIComponent(top.platformUserId)}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            {top.label}
          </Link>
          <Link
            href={`/app/doctor/clients/${encodeURIComponent(bottom.platformUserId)}`}
            className="text-muted-foreground underline-offset-2 hover:underline"
          >
            {bottom.label}
          </Link>
        </div>
      );
    }
    if (mb && mb.length === 1) {
      const only = mb[0];
      return (
        <Link
          href={`/app/doctor/clients/${encodeURIComponent(only.platformUserId)}`}
          className="text-primary underline-offset-2 hover:underline font-sans text-xs break-words"
        >
          {only.label}
        </Link>
      );
    }
  }

  const tid = row.target_id;
  if (!tid) return <span className="text-muted-foreground">—</span>;
  if (isUuid(tid)) {
    return (
      <Link
        href={`/app/doctor/clients/${encodeURIComponent(tid)}`}
        className="font-mono text-xs break-all text-primary underline-offset-2 hover:underline"
      >
        {tid}
      </Link>
    );
  }
  return <span className="font-mono text-xs break-all">{tid}</span>;
}
