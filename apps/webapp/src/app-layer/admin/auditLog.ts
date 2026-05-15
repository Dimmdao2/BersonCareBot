export {
  computeConflictKeyFromCandidateIds,
  countOpenAutoMergeConflicts,
  listAdminAuditLog,
  upsertOpenConflictLog,
  writeAuditLog,
  type AuditLogWriteEntry,
  type ListAdminAuditLogParams,
  type ListAdminAuditLogResult,
  type UpsertOpenConflictLogInput,
  type UpsertOpenConflictLogResult,
} from "@/infra/adminAuditLog";
