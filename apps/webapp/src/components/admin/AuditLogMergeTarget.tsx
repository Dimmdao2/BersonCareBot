'use client';

import Link from 'next/link';
import {
  isMergeAuditAction,
  isMessengerPhoneBindAuditAction,
  parseMergeAuditDetails,
  parseMessengerPhoneBindAuditInitiator,
  parseMessengerPhoneBindAuditTargets,
} from '@/infra/adminAuditLogPresentation';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
          <span>{top}</span>
          <span className="text-muted-foreground">{bottom}</span>
        </div>
      );
    }
  }

  if (isMessengerPhoneBindAuditAction(row.action)) {
    const mb = parseMessengerPhoneBindAuditTargets(details);
    const ini = parseMessengerPhoneBindAuditInitiator(details);
    if (mb && mb.length >= 1) {
      return (
        <div className="flex flex-col gap-0.5 font-sans text-xs break-words">
          {mb.map((rowItem, idx) => (
            <span
              key={rowItem.platformUserId}
              className={idx === 0 ? undefined : 'text-muted-foreground'}
            >
              {rowItem.label}
            </span>
          ))}
          {ini ? (
            <span className="text-muted-foreground">
              {ini.channelLabel}
              {' · '}
              {ini.messengerDisplayHint ?? ini.externalId}
            </span>
          ) : null}
          {mb.length >= 2 && isUuid(mb[0].platformUserId) && isUuid(mb[1].platformUserId) ? (
            <Link
              href={`/app/admin/account-merge?targetId=${encodeURIComponent(mb[0].platformUserId)}&duplicateId=${encodeURIComponent(mb[1].platformUserId)}`}
              className="mt-0.5 text-primary underline-offset-2 hover:underline"
            >
              Разобрать и объединить
            </Link>
          ) : null}
        </div>
      );
    }
  }

  const tid = row.target_id;
  if (!tid) return <span className="text-muted-foreground">—</span>;
  return <span className="font-mono text-xs break-all">{tid}</span>;
}
