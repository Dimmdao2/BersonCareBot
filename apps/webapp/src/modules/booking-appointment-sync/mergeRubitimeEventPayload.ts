function coerceString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

export type RubitimeFanoutTopLevel = {
  dateTimeEnd?: string | null;
  serviceId?: string | null;
  rubitimeCooperatorId?: string | null;
  integratorBranchId?: string | null;
};

/** Merge integrator fan-out top-level fields into `payloadJson` for canonical projection. */
export function mergeRubitimeFanoutIntoPayload(
  payloadJson: unknown,
  fanout?: RubitimeFanoutTopLevel,
): Record<string, unknown> {
  const base =
    payloadJson && typeof payloadJson === "object" && !Array.isArray(payloadJson)
      ? { ...(payloadJson as Record<string, unknown>) }
      : {};

  const dateTimeEnd =
    coerceString(fanout?.dateTimeEnd) ??
    coerceString(base.datetime_end) ??
    coerceString(base.date_time_end);
  if (dateTimeEnd) {
    base.datetime_end = dateTimeEnd;
    base.date_time_end = dateTimeEnd;
  }

  const serviceId =
    coerceString(fanout?.serviceId) ??
    coerceString(base.service_id) ??
    coerceString(base.rubitime_service_id);
  if (serviceId) {
    base.service_id = serviceId;
    base.rubitime_service_id = serviceId;
  }

  const cooperatorId =
    coerceString(fanout?.rubitimeCooperatorId) ??
    coerceString(base.cooperator_id) ??
    coerceString(base.rubitime_cooperator_id) ??
    coerceString(base.specialist_id);
  if (cooperatorId) {
    base.cooperator_id = cooperatorId;
    base.rubitime_cooperator_id = cooperatorId;
  }

  const branchId =
    coerceString(fanout?.integratorBranchId) ??
    coerceString(base.branch_id) ??
    coerceString(base.rubitime_branch_id);
  if (branchId) {
    base.branch_id = branchId;
    base.rubitime_branch_id = branchId;
  }

  return base;
}
