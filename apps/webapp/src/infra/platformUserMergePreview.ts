/**
 * Manual merge preview (read-only): conflicts, hard blockers, dependent counts, recommendations.
 * Apply flow is implemented separately (manual merge engine).
 */
import type { Pool } from "pg";
import { checkIntegratorCanonicalPair } from "@/infra/integrations/integratorUserMergeM2mClient";
import { pickMergeTargetId } from "@/infra/repos/pgPlatformUserMerge";
import { logger } from "@/infra/logging/logger";
import { getConfigBool } from "@/modules/system-settings/configAdapter";

/** Rows compatible with {@link pickMergeTargetId} / merge transaction loader. */
export type MergePreviewPlatformUserRow = {
  id: string;
  phone_normalized: string | null;
  integrator_user_id: string | null;
  merged_into_id: string | null;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  email_verified_at: Date | null;
  role: string;
  created_at: Date;
  updated_at: Date;
  is_blocked: boolean;
  is_archived: boolean;
  blocked_at: Date | null;
  blocked_reason: string | null;
  blocked_by: string | null;
};

export type MergePreviewChannelBinding = {
  channel_code: string;
  external_id: string;
  created_at: Date;
};

export type MergePreviewOAuthBinding = {
  provider: string;
  provider_user_id: string;
  email: string | null;
  created_at: Date;
};

export type MergePreviewDependentCounts = {
  patientBookings: number;
  reminderRules: number;
  supportConversations: number;
  symptomTrackings: number;
  lfkComplexes: number;
  mediaFilesUploadedBy: number;
  onlineIntakeRequests: number;
};

export type MergePreviewHardBlockerCode =
  | "target_is_alias"
  | "duplicate_is_alias"
  | "different_non_null_integrator_user_id"
  | "integrator_canonical_merge_required"
  | "integrator_merge_status_unavailable"
  | "active_bookings_time_overlap"
  | "active_lfk_template_conflict"
  | "shared_phone_both_have_meaningful_data";

/** How to treat two different non-null integrator_user_id values in preview (v1 hard block vs v2 gate). */
export type IntegratorPairPreview =
  | { kind: "not_applicable" }
  | { kind: "v1_both_different_non_null" }
  | { kind: "v2_canonical_aligned" }
  | { kind: "v2_merge_required" }
  | { kind: "v2_status_unavailable" };

export type MergePreviewHardBlocker = {
  code: MergePreviewHardBlockerCode;
  message: string;
  /** Extra machine-readable context for UI / logs */
  details?: Record<string, unknown>;
};

export type MergePreviewScalarFieldKey =
  | "phone_normalized"
  | "display_name"
  | "first_name"
  | "last_name"
  | "email";

export type MergePreviewScalarConflict = {
  field: MergePreviewScalarFieldKey;
  targetValue: string | null;
  duplicateValue: string | null;
  recommendedWinner: "target" | "duplicate";
  reason: string;
};

export type MergePreviewChannelConflict = {
  channelCode: string;
  targetExternalId: string | null;
  duplicateExternalId: string | null;
  recommendedWinner: "target" | "duplicate";
  reason: string;
};

export type MergePreviewOauthConflict = {
  provider: string;
  targetProviderUserId: string | null;
  duplicateProviderUserId: string | null;
  recommendedWinner: "target" | "duplicate";
  reason: string;
};

export type MergePreviewAutoMergeScalar = {
  field: MergePreviewScalarFieldKey;
  /** Effective value after auto-merge (current COALESCE / display_name CASE semantics). */
  effectiveValue: string | null;
  note: string;
};

export type MergePreviewRecommendation = {
  suggestedTargetId: string;
  suggestedDuplicateId: string;
  basis: "pick_merge_target_heuristic";
  /** Older account wins tie-break for scalar/binding conflicts (UI default). */
  defaultWinnerBias: "older_created_at";
};

export type MergePreviewModel = {
  ok: true;
  targetId: string;
  duplicateId: string;
  target: MergePreviewPlatformUserRow;
  duplicate: MergePreviewPlatformUserRow;
  targetBindings: MergePreviewChannelBinding[];
  duplicateBindings: MergePreviewChannelBinding[];
  targetOauth: MergePreviewOAuthBinding[];
  duplicateOauth: MergePreviewOAuthBinding[];
  dependentCounts: {
    target: MergePreviewDependentCounts;
    duplicate: MergePreviewDependentCounts;
  };
  hardBlockers: MergePreviewHardBlocker[];
  scalarConflicts: MergePreviewScalarConflict[];
  channelConflicts: MergePreviewChannelConflict[];
  oauthConflicts: MergePreviewOauthConflict[];
  autoMergeScalars: MergePreviewAutoMergeScalar[];
  recommendation: MergePreviewRecommendation;
  /** `true` iff no hard blockers (preview-only; see `v1MergeEngineCallable`). */
  mergeAllowed: boolean;
  /**
   * `true` iff today’s `mergePlatformUsersInTransaction` can succeed for this pair
   * (no hard blockers **and** no different non-null phones — engine throws `MergeConflictError` before dependent guards).
   * Does not imply channel/oauth/email semantics are ideal; manual merge may still change resolution later.
   */
  v1MergeEngineCallable: boolean;
  /** Admin setting `platform_user_merge_v2_enabled` at preview time. */
  platformUserMergeV2Enabled: boolean;
};

export type MergePreviewErrorCode = "same_id" | "missing_user" | "not_client";

export type MergePreviewError = {
  ok: false;
  error: MergePreviewErrorCode;
  message: string;
};

export type MergePreviewResult = MergePreviewModel | MergePreviewError;

const SCALAR_FIELDS: MergePreviewScalarFieldKey[] = [
  "phone_normalized",
  "display_name",
  "first_name",
  "last_name",
  "email",
];

function normStr(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function emailsEqual(a: string | null, b: string | null): boolean {
  const na = normStr(a);
  const nb = normStr(b);
  if (!na || !nb) return false;
  return na.toLowerCase() === nb.toLowerCase();
}

function scalarConflict(
  field: MergePreviewScalarFieldKey,
  target: MergePreviewPlatformUserRow,
  duplicate: MergePreviewPlatformUserRow,
): MergePreviewScalarConflict | null {
  let tv: string | null;
  let dv: string | null;
  switch (field) {
    case "phone_normalized":
      tv = normStr(target.phone_normalized);
      dv = normStr(duplicate.phone_normalized);
      break;
    case "display_name":
      tv = normStr(target.display_name);
      dv = normStr(duplicate.display_name);
      break;
    case "first_name":
      tv = normStr(target.first_name);
      dv = normStr(duplicate.first_name);
      break;
    case "last_name":
      tv = normStr(target.last_name);
      dv = normStr(duplicate.last_name);
      break;
    case "email":
      tv = normStr(target.email);
      dv = normStr(duplicate.email);
      break;
    default:
      return null;
  }
  if (tv == null || dv == null || tv === dv) return null;
  if (field === "email" && emailsEqual(tv, dv)) return null;
  const older =
    target.created_at.getTime() <= duplicate.created_at.getTime() ? ("target" as const) : ("duplicate" as const);
  return {
    field,
    targetValue: tv,
    duplicateValue: dv,
    recommendedWinner: older,
    reason: "older_created_at_preferred",
  };
}

function bindingForChannel(
  bindings: MergePreviewChannelBinding[],
  code: string,
): MergePreviewChannelBinding | undefined {
  return bindings.find((b) => b.channel_code === code);
}

function oauthByProvider(
  rows: MergePreviewOAuthBinding[],
  provider: string,
): MergePreviewOAuthBinding | undefined {
  return rows.find((o) => o.provider === provider);
}

function inferIntegratorPairPreview(
  target: MergePreviewPlatformUserRow,
  duplicate: MergePreviewPlatformUserRow,
): IntegratorPairPreview {
  const iT = normStr(target.integrator_user_id);
  const iD = normStr(duplicate.integrator_user_id);
  if (!iT || !iD || iT === iD) return { kind: "not_applicable" };
  return { kind: "v1_both_different_non_null" };
}

/** Exported for unit tests — pure preview from already-loaded rows. */
export function analyzeMergePreviewModel(
  target: MergePreviewPlatformUserRow,
  duplicate: MergePreviewPlatformUserRow,
  opts: {
    targetBindings: MergePreviewChannelBinding[];
    duplicateBindings: MergePreviewChannelBinding[];
    targetOauth: MergePreviewOAuthBinding[];
    duplicateOauth: MergePreviewOAuthBinding[];
    dependentCounts: { target: MergePreviewDependentCounts; duplicate: MergePreviewDependentCounts };
    activeBookingOverlapCount: number;
    activeLfkTemplateConflictCount: number;
    meaningfulDataScoreTarget: number;
    meaningfulDataScoreDuplicate: number;
    /** When omitted, inferred from rows (v1 blocker if both integrator ids differ). */
    integratorPairPreview?: IntegratorPairPreview;
    platformUserMergeV2Enabled?: boolean;
  },
): MergePreviewModel {
  const picked = pickMergeTargetId(target, duplicate);
  const recommendation: MergePreviewRecommendation = {
    suggestedTargetId: picked.target,
    suggestedDuplicateId: picked.duplicate,
    basis: "pick_merge_target_heuristic",
    defaultWinnerBias: "older_created_at",
  };

  const hardBlockers: MergePreviewHardBlocker[] = [];

  if (target.merged_into_id != null) {
    hardBlockers.push({
      code: "target_is_alias",
      message: "Target row is a merge alias (merged_into_id is set); resolve chain first.",
      details: { merged_into_id: target.merged_into_id },
    });
  }
  if (duplicate.merged_into_id != null) {
    hardBlockers.push({
      code: "duplicate_is_alias",
      message: "Duplicate row is a merge alias (merged_into_id is set); resolve chain first.",
      details: { merged_into_id: duplicate.merged_into_id },
    });
  }

  const iT = normStr(target.integrator_user_id);
  const iD = normStr(duplicate.integrator_user_id);
  const pair = opts.integratorPairPreview ?? inferIntegratorPairPreview(target, duplicate);
  if (iT != null && iD != null && iT !== iD) {
    if (pair.kind === "v1_both_different_non_null") {
      hardBlockers.push({
        code: "different_non_null_integrator_user_id",
        message:
          "Both users have different non-null integrator_user_id — merge blocked (phantom user / projection risk).",
        details: { targetIntegratorUserId: iT, duplicateIntegratorUserId: iD },
      });
    } else if (pair.kind === "v2_merge_required") {
      hardBlockers.push({
        code: "integrator_canonical_merge_required",
        message:
          "Both users have different integrator_user_id — complete integrator canonical merge first (then webapp projection realignment if needed), then retry preview.",
        details: { targetIntegratorUserId: iT, duplicateIntegratorUserId: iD },
      });
    } else if (pair.kind === "v2_status_unavailable") {
      hardBlockers.push({
        code: "integrator_merge_status_unavailable",
        message:
          "Cannot verify integrator canonical merge status (INTEGRATOR_API_URL / webhook secret missing or integrator error).",
        details: { targetIntegratorUserId: iT, duplicateIntegratorUserId: iD },
      });
    }
  }

  if (opts.activeBookingOverlapCount > 0) {
    hardBlockers.push({
      code: "active_bookings_time_overlap",
      message: "Active patient_bookings overlap in time between candidates (same cooperator snapshot rule as merge guard).",
      details: { overlapPairCount: opts.activeBookingOverlapCount },
    });
  }

  if (opts.activeLfkTemplateConflictCount > 0) {
    hardBlockers.push({
      code: "active_lfk_template_conflict",
      message: "Active patient_lfk_assignments share the same template on both users.",
      details: { conflictingTemplateRows: opts.activeLfkTemplateConflictCount },
    });
  }

  const pT = normStr(target.phone_normalized);
  const pD = normStr(duplicate.phone_normalized);
  if (pT != null && pD != null && pT === pD) {
    if (opts.meaningfulDataScoreTarget > 0 && opts.meaningfulDataScoreDuplicate > 0) {
      hardBlockers.push({
        code: "shared_phone_both_have_meaningful_data",
        message: "Shared phone with meaningful data on both users (same guard as assertSharedPhoneGuard).",
        details: {
          meaningfulDataScoreTarget: opts.meaningfulDataScoreTarget,
          meaningfulDataScoreDuplicate: opts.meaningfulDataScoreDuplicate,
        },
      });
    }
  }

  const scalarConflicts: MergePreviewScalarConflict[] = [];
  for (const f of SCALAR_FIELDS) {
    const c = scalarConflict(f, target, duplicate);
    if (c) scalarConflicts.push(c);
  }

  const channelCodes = new Set<string>();
  for (const b of [...opts.targetBindings, ...opts.duplicateBindings]) {
    channelCodes.add(b.channel_code);
  }

  const channelConflicts: MergePreviewChannelConflict[] = [];
  for (const code of channelCodes) {
    const tb = bindingForChannel(opts.targetBindings, code);
    const db = bindingForChannel(opts.duplicateBindings, code);
    const te = tb?.external_id ?? null;
    const de = db?.external_id ?? null;
    if (te != null && de != null && te !== de) {
      const older =
        target.created_at.getTime() <= duplicate.created_at.getTime() ? ("target" as const) : ("duplicate" as const);
      channelConflicts.push({
        channelCode: code,
        targetExternalId: te,
        duplicateExternalId: de,
        recommendedWinner: older,
        reason: "different_external_id_same_channel",
      });
    }
  }

  const providers = new Set<string>();
  for (const o of [...opts.targetOauth, ...opts.duplicateOauth]) {
    providers.add(o.provider);
  }
  const oauthConflicts: MergePreviewOauthConflict[] = [];
  for (const provider of providers) {
    const to = oauthByProvider(opts.targetOauth, provider);
    const du = oauthByProvider(opts.duplicateOauth, provider);
    const tp = to?.provider_user_id ?? null;
    const dp = du?.provider_user_id ?? null;
    if (tp != null && dp != null && tp !== dp) {
      const older =
        target.created_at.getTime() <= duplicate.created_at.getTime() ? ("target" as const) : ("duplicate" as const);
      oauthConflicts.push({
        provider,
        targetProviderUserId: tp,
        duplicateProviderUserId: dp,
        recommendedWinner: older,
        reason: "different_provider_user_id",
      });
    }
  }

  const autoMergeScalars: MergePreviewAutoMergeScalar[] = [];
  for (const f of SCALAR_FIELDS) {
    if (scalarConflicts.some((c) => c.field === f)) continue;
    let effective: string | null;
    let note: string;
    switch (f) {
      case "phone_normalized":
        effective = normStr(target.phone_normalized) ?? normStr(duplicate.phone_normalized);
        note = "COALESCE(target, duplicate) — matches current merge engine.";
        break;
      case "display_name": {
        const pu = normStr(target.display_name);
        const pd = normStr(duplicate.display_name);
        // Same CASE as merge UPDATE: duplicate wins only when target empty and duplicate non-empty.
        if (pd && !pu) {
          effective = pd;
        } else {
          effective = pu ?? pd;
        }
        note = "CASE display_name — matches mergePlatformUsersInTransaction.";
        break;
      }
      case "first_name":
      case "last_name":
      case "email":
        effective = normStr(target[f]) ?? normStr(duplicate[f]);
        note = "COALESCE(target, duplicate) — matches current merge engine.";
        break;
      default:
        effective = null;
        note = "";
    }
    autoMergeScalars.push({ field: f, effectiveValue: effective, note });
  }

  const mergeAllowed = hardBlockers.length === 0;
  const differentNonNullPhones =
    pT != null && pD != null && pT !== pD;
  const v1MergeEngineCallable = mergeAllowed && !differentNonNullPhones;
  const platformUserMergeV2Enabled = opts.platformUserMergeV2Enabled === true;

  return {
    ok: true,
    targetId: target.id,
    duplicateId: duplicate.id,
    target,
    duplicate,
    targetBindings: opts.targetBindings,
    duplicateBindings: opts.duplicateBindings,
    targetOauth: opts.targetOauth,
    duplicateOauth: opts.duplicateOauth,
    dependentCounts: opts.dependentCounts,
    hardBlockers,
    scalarConflicts,
    channelConflicts,
    oauthConflicts,
    autoMergeScalars,
    recommendation,
    mergeAllowed,
    v1MergeEngineCallable,
    platformUserMergeV2Enabled,
  };
}

async function loadPlatformUser(pool: Pool, id: string): Promise<MergePreviewPlatformUserRow | null> {
  const r = await pool.query<MergePreviewPlatformUserRow>(
    `SELECT id,
            phone_normalized,
            integrator_user_id::text AS integrator_user_id,
            merged_into_id,
            display_name,
            first_name,
            last_name,
            email,
            email_verified_at,
            role,
            created_at,
            updated_at,
            is_blocked,
            is_archived,
            blocked_at,
            blocked_reason,
            blocked_by::text AS blocked_by
     FROM platform_users
     WHERE id = $1::uuid`,
    [id],
  );
  return r.rows[0] ?? null;
}

async function loadBindings(pool: Pool, userId: string): Promise<MergePreviewChannelBinding[]> {
  const r = await pool.query<MergePreviewChannelBinding>(
    `SELECT channel_code, external_id, created_at
     FROM user_channel_bindings
     WHERE user_id = $1::uuid
     ORDER BY channel_code`,
    [userId],
  );
  return r.rows;
}

async function loadOauth(pool: Pool, userId: string): Promise<MergePreviewOAuthBinding[]> {
  const r = await pool.query<MergePreviewOAuthBinding>(
    `SELECT provider, provider_user_id, email, created_at
     FROM user_oauth_bindings
     WHERE user_id = $1::uuid
     ORDER BY provider`,
    [userId],
  );
  return r.rows;
}

async function countMeaningfulData(client: Pool, userId: string): Promise<number> {
  const q = [
    `SELECT COUNT(*)::int AS c FROM patient_bookings WHERE platform_user_id = $1::uuid`,
    `SELECT COUNT(*)::int AS c FROM doctor_notes WHERE user_id = $1::uuid`,
    `SELECT COUNT(*)::int AS c FROM online_intake_requests WHERE user_id = $1::uuid`,
    `SELECT COUNT(*)::int AS c FROM symptom_trackings WHERE platform_user_id = $1::uuid OR user_id = $1::text`,
    `SELECT COUNT(*)::int AS c FROM lfk_complexes WHERE platform_user_id = $1::uuid OR user_id = $1::text`,
    `SELECT COUNT(*)::int AS c FROM patient_lfk_assignments WHERE patient_user_id = $1::uuid`,
    `SELECT COUNT(*)::int AS c FROM message_log WHERE platform_user_id = $1::uuid OR user_id = $1::text`,
  ];
  let sum = 0;
  for (const sql of q) {
    const r = await client.query<{ c: number }>(sql, [userId]);
    sum += r.rows[0]?.c ?? 0;
  }
  return sum;
}

async function countDependents(pool: Pool, userId: string): Promise<MergePreviewDependentCounts> {
  const [
    pb,
    rr,
    sc,
    st,
    lfk,
    mf,
    oi,
  ] = await Promise.all([
    pool.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM patient_bookings WHERE platform_user_id = $1::uuid`,
      [userId],
    ),
    pool.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM reminder_rules WHERE platform_user_id = $1::uuid`,
      [userId],
    ),
    pool.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM support_conversations WHERE platform_user_id = $1::uuid`,
      [userId],
    ),
    pool.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM symptom_trackings WHERE platform_user_id = $1::uuid OR user_id = $1::text`,
      [userId],
    ),
    pool.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM lfk_complexes WHERE platform_user_id = $1::uuid OR user_id = $1::text`,
      [userId],
    ),
    pool.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM media_files WHERE uploaded_by = $1::uuid`,
      [userId],
    ),
    pool.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM online_intake_requests WHERE user_id = $1::uuid`,
      [userId],
    ),
  ]);
  return {
    patientBookings: pb.rows[0]?.c ?? 0,
    reminderRules: rr.rows[0]?.c ?? 0,
    supportConversations: sc.rows[0]?.c ?? 0,
    symptomTrackings: st.rows[0]?.c ?? 0,
    lfkComplexes: lfk.rows[0]?.c ?? 0,
    mediaFilesUploadedBy: mf.rows[0]?.c ?? 0,
    onlineIntakeRequests: oi.rows[0]?.c ?? 0,
  };
}

async function countActiveBookingOverlap(pool: Pool, targetId: string, duplicateId: string): Promise<number> {
  const overlap = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM patient_bookings pb1
     INNER JOIN patient_bookings pb2
       ON pb1.platform_user_id = $1::uuid
      AND pb2.platform_user_id = $2::uuid
      AND pb1.id <> pb2.id
      AND tstzrange(pb1.slot_start, pb1.slot_end, '[)') && tstzrange(pb2.slot_start, pb2.slot_end, '[)')
      AND pb1.status IN ('confirmed', 'rescheduled', 'creating', 'cancelling', 'cancel_failed')
      AND pb2.status IN ('confirmed', 'rescheduled', 'creating', 'cancelling', 'cancel_failed')
      AND (
        (pb1.rubitime_cooperator_id_snapshot IS NOT NULL AND pb1.rubitime_cooperator_id_snapshot = pb2.rubitime_cooperator_id_snapshot)
        OR (pb1.rubitime_cooperator_id_snapshot IS NULL AND pb2.rubitime_cooperator_id_snapshot IS NULL)
      )`,
    [targetId, duplicateId],
  );
  return parseInt(overlap.rows[0]?.c ?? "0", 10);
}

async function countActiveLfkTemplateConflict(pool: Pool, targetId: string, duplicateId: string): Promise<number> {
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM patient_lfk_assignments a
     INNER JOIN patient_lfk_assignments b
       ON a.patient_user_id = $1::uuid
      AND b.patient_user_id = $2::uuid
      AND a.template_id = b.template_id
      AND a.is_active = true
      AND b.is_active = true`,
    [targetId, duplicateId],
  );
  return parseInt(r.rows[0]?.c ?? "0", 10);
}

export async function buildMergePreview(pool: Pool, targetId: string, duplicateId: string): Promise<MergePreviewResult> {
  if (targetId === duplicateId) {
    return { ok: false, error: "same_id", message: "targetId and duplicateId must differ" };
  }

  const [target, duplicate] = await Promise.all([loadPlatformUser(pool, targetId), loadPlatformUser(pool, duplicateId)]);

  if (!target || !duplicate) {
    return { ok: false, error: "missing_user", message: "One or both platform_users rows were not found" };
  }

  if (target.role !== "client" || duplicate.role !== "client") {
    return { ok: false, error: "not_client", message: "Manual merge preview is only defined for role=client users" };
  }

  const [
    targetBindings,
    duplicateBindings,
    targetOauth,
    duplicateOauth,
    meaningfulDataScoreTarget,
    meaningfulDataScoreDuplicate,
    activeBookingOverlapCount,
    activeLfkTemplateConflictCount,
    depTarget,
    depDup,
  ] = await Promise.all([
    loadBindings(pool, targetId),
    loadBindings(pool, duplicateId),
    loadOauth(pool, targetId),
    loadOauth(pool, duplicateId),
    countMeaningfulData(pool, targetId),
    countMeaningfulData(pool, duplicateId),
    countActiveBookingOverlap(pool, targetId, duplicateId),
    countActiveLfkTemplateConflict(pool, targetId, duplicateId),
    countDependents(pool, targetId),
    countDependents(pool, duplicateId),
  ]);

  const v2Enabled = await getConfigBool("platform_user_merge_v2_enabled", false);
  const iT = normStr(target.integrator_user_id);
  const iD = normStr(duplicate.integrator_user_id);

  let integratorPairPreview: IntegratorPairPreview = inferIntegratorPairPreview(target, duplicate);
  if (v2Enabled && iT && iD && iT !== iD) {
    const st = await checkIntegratorCanonicalPair(iT, iD);
    if (!st.ok) {
      integratorPairPreview = { kind: "v2_status_unavailable" };
    } else if (st.sameCanonical) {
      integratorPairPreview = { kind: "v2_canonical_aligned" };
    } else {
      integratorPairPreview = { kind: "v2_merge_required" };
    }
  }

  const model = analyzeMergePreviewModel(target, duplicate, {
    targetBindings,
    duplicateBindings,
    targetOauth,
    duplicateOauth,
    dependentCounts: { target: depTarget, duplicate: depDup },
    activeBookingOverlapCount,
    activeLfkTemplateConflictCount,
    meaningfulDataScoreTarget,
    meaningfulDataScoreDuplicate,
    integratorPairPreview,
    platformUserMergeV2Enabled: v2Enabled,
  });

  logger.info(
    {
      targetId,
      duplicateId,
      mergeAllowed: model.mergeAllowed,
      v1MergeEngineCallable: model.v1MergeEngineCallable,
      hardBlockerCount: model.hardBlockers.length,
      scalarConflictCount: model.scalarConflicts.length,
      platformUserMergeV2Enabled: model.platformUserMergeV2Enabled,
    },
    "[merge-preview] computed",
  );

  return model;
}

export type MergeCandidateRow = {
  id: string;
  display_name: string;
  phone_normalized: string | null;
  email: string | null;
  integrator_user_id: string | null;
  created_at: Date;
};

/**
 * Other canonical clients that share at least one identity key with the anchor user
 * (phone, email, integrator id, or messenger external_id via user_channel_bindings).
 * Optional `q` narrows by substring match on id / phones / email / names / integrator id / binding ids.
 */
export async function searchMergeCandidates(
  pool: Pool,
  anchorUserId: string,
  qRaw: string | null | undefined,
): Promise<
  | { ok: true; anchorUserId: string; candidates: MergeCandidateRow[] }
  | { ok: false; error: "not_found" | "not_client" | "is_alias"; message: string }
> {
  const anchor = await loadPlatformUser(pool, anchorUserId);
  if (!anchor) {
    return { ok: false, error: "not_found", message: "Anchor user not found" };
  }
  if (anchor.role !== "client") {
    return { ok: false, error: "not_client", message: "Merge candidates search is only for client users" };
  }
  if (anchor.merged_into_id != null) {
    return { ok: false, error: "is_alias", message: "Anchor user is a merge alias; resolve canonical user first" };
  }

  const q = normStr(qRaw ?? null);
  const params: unknown[] = [anchorUserId];
  let qFilter = "";
  if (q) {
    params.push(`%${q}%`);
    const p = params.length;
    qFilter = `
      AND (
        pu.id::text ILIKE $${p}
        OR pu.phone_normalized ILIKE $${p}
        OR pu.email ILIKE $${p}
        OR pu.display_name ILIKE $${p}
        OR pu.first_name ILIKE $${p}
        OR pu.last_name ILIKE $${p}
        OR pu.integrator_user_id::text ILIKE $${p}
        OR EXISTS (
          SELECT 1 FROM user_channel_bindings ucb
          WHERE ucb.user_id = pu.id AND ucb.external_id ILIKE $${p}
        )
      )
    `;
  }

  const sql = `
    WITH anchor AS (
      SELECT id, phone_normalized, email, integrator_user_id
      FROM platform_users
      WHERE id = $1::uuid
    )
    SELECT pu.id,
           pu.display_name,
           pu.phone_normalized,
           pu.email,
           pu.integrator_user_id::text AS integrator_user_id,
           pu.created_at
    FROM platform_users pu, anchor
    WHERE pu.id <> anchor.id
      AND pu.role = 'client'
      AND pu.merged_into_id IS NULL
      AND (
        (anchor.phone_normalized IS NOT NULL AND pu.phone_normalized IS NOT DISTINCT FROM anchor.phone_normalized)
        OR (
          anchor.email IS NOT NULL AND pu.email IS NOT NULL
          AND lower(trim(pu.email)) = lower(trim(anchor.email))
        )
        OR (
          anchor.integrator_user_id IS NOT NULL
          AND pu.integrator_user_id IS NOT DISTINCT FROM anchor.integrator_user_id
        )
        OR EXISTS (
          SELECT 1
          FROM user_channel_bindings cba
          INNER JOIN user_channel_bindings cbb
            ON cba.channel_code = cbb.channel_code
           AND cba.external_id = cbb.external_id
          WHERE cba.user_id = pu.id AND cbb.user_id = anchor.id
        )
      )
      ${qFilter}
    ORDER BY pu.created_at DESC
    LIMIT 100
  `;

  const r = await pool.query<MergeCandidateRow>(sql, params);
  return { ok: true, anchorUserId, candidates: r.rows };
}

/**
 * Admin merge UI: search any canonical client by substring (no anchor overlap required).
 * `limit` is clamped to 1..100; empty/whitespace `qRaw` returns [] without hitting the DB.
 */
export async function searchMergeUsersForManualMerge(
  pool: Pool,
  qRaw: string | null | undefined,
  limit: number,
): Promise<MergeCandidateRow[]> {
  const q = normStr(qRaw ?? null);
  if (!q || limit <= 0) {
    return [];
  }
  const pattern = `%${q}%`;
  const lim = Math.min(Math.max(1, limit), 100);
  const sql = `
    SELECT pu.id,
           pu.display_name,
           pu.phone_normalized,
           pu.email,
           pu.integrator_user_id::text AS integrator_user_id,
           pu.created_at
    FROM platform_users pu
    WHERE pu.role = 'client'
      AND pu.merged_into_id IS NULL
      AND (
        pu.id::text ILIKE $1
        OR pu.phone_normalized ILIKE $1
        OR pu.email ILIKE $1
        OR pu.display_name ILIKE $1
        OR pu.first_name ILIKE $1
        OR pu.last_name ILIKE $1
        OR pu.integrator_user_id::text ILIKE $1
        OR EXISTS (
          SELECT 1 FROM user_channel_bindings ucb
          WHERE ucb.user_id = pu.id AND ucb.external_id ILIKE $1
        )
      )
    ORDER BY pu.created_at DESC
    LIMIT $2::int
  `;
  const r = await pool.query<MergeCandidateRow>(sql, [pattern, lim]);
  return r.rows;
}
