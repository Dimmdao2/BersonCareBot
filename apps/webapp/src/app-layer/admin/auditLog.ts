export {
  computeConflictKeyFromCandidateIds,
  countOpenAutoMergeConflicts,
  listAdminAuditLog,
  resolveAdminAuditConflictById,
  upsertOpenConflictLog,
  writeAuditLog,
  type AuditLogWriteEntry,
  type ListAdminAuditLogParams,
  type ListAdminAuditLogResult,
  type ResolveAdminAuditConflictResult,
  type UpsertOpenConflictLogInput,
  type UpsertOpenConflictLogResult,
} from "@/infra/adminAuditLog";
