import { runWebappPgText } from "@/infra/db/runWebappSql";
import { WELLBEING_GENERAL_MIRROR_NOTE } from "@/modules/diaries/wellbeingGeneralMirrorNote";
import {
  detectProgramInactivityInsights,
  detectWellbeingLowStreakInsights,
  mergeProactiveInsights,
  type ProactivePatientRef,
  type ProactiveProgramActivity,
  type ProactiveWellbeingEntry,
} from "@/modules/doctor-proactive-insights/computeProactiveInsights";
import {
  DOCTOR_TODAY_PROACTIVE_INSIGHTS_PREVIEW_LIMIT,
  PROACTIVE_PROGRAM_INACTIVITY_DAYS,
  PROACTIVE_WELLBEING_LOW_STREAK_DAYS,
} from "@/modules/doctor-proactive-insights/constants";
import type { DoctorProactiveInsightsPort } from "@/modules/doctor-proactive-insights/ports";
import type { ProactiveInsightRow } from "@/modules/doctor-proactive-insights/types";
import { DateTime } from "luxon";

const BUILD_INSIGHTS_CAP = 500;

/** Wave 3 phase 13D — domain SQL via `runWebappPgText`. */
async function listOnSupportPatients(): Promise<ProactivePatientRef[]> {
  const res = await runWebappPgText<{ id: string; display_name: string | null }>(
    `SELECT pu.id, pu.display_name
     FROM doctor_patient_support dps
     JOIN platform_users pu ON pu.id = dps.patient_user_id
     WHERE dps.on_support = true
       AND pu.role = 'client'
       AND pu.merged_into_id IS NULL
       AND COALESCE(pu.is_archived, false) = false
     ORDER BY pu.display_name, pu.id`,
  );
  return res.rows.map((r) => ({
    patientUserId: r.id,
    displayName: r.display_name?.trim() || "—",
  }));
}

async function listWellbeingEntries(
  patientIds: string[],
  fromIso: string,
  toExclusiveIso: string,
): Promise<ProactiveWellbeingEntry[]> {
  if (patientIds.length === 0) return [];
  const res = await runWebappPgText<{
    platform_user_id: string;
    value_0_10: number;
    recorded_at: Date;
    notes: string | null;
  }>(
    `SELECT e.platform_user_id, e.value_0_10, e.recorded_at, e.notes
     FROM symptom_entries e
     JOIN symptom_trackings t ON t.id = e.tracking_id
     WHERE e.platform_user_id = ANY($1::uuid[])
       AND t.symptom_key = 'general_wellbeing'
       AND t.deleted_at IS NULL
       AND e.recorded_at >= $2::timestamptz
       AND e.recorded_at < $3::timestamptz
       AND (e.notes IS NULL OR e.notes <> $4)`,
    [patientIds, fromIso, toExclusiveIso, WELLBEING_GENERAL_MIRROR_NOTE],
  );
  return res.rows.map((r) => ({
    patientUserId: r.platform_user_id,
    recordedAt: r.recorded_at.toISOString(),
    value: Number(r.value_0_10),
    notes: r.notes,
  }));
}

async function listProgramActivity(patientIds: string[]): Promise<ProactiveProgramActivity[]> {
  if (patientIds.length === 0) return [];

  const activeRes = await runWebappPgText<{ patient_user_id: string; instance_id: string }>(
    `SELECT DISTINCT ON (tpi.patient_user_id)
       tpi.patient_user_id,
       tpi.id::text AS instance_id
     FROM treatment_program_instances tpi
     WHERE tpi.patient_user_id = ANY($1::uuid[])
       AND tpi.status = 'active'
       AND tpi.assignment_source = 'doctor'
     ORDER BY tpi.patient_user_id, tpi.updated_at DESC NULLS LAST, tpi.id DESC`,
    [patientIds],
  );

  const activeByPatient = new Map(
    activeRes.rows.map((r) => [r.patient_user_id, r.instance_id] as const),
  );
  const instanceIds = [...activeByPatient.values()];

  const lastDoneByInstance = new Map<string, string>();
  if (instanceIds.length > 0) {
    const doneRes = await runWebappPgText<{ instance_id: string; last_done_at: Date | null }>(
      `SELECT pal.instance_id::text AS instance_id, MAX(pal.created_at) AS last_done_at
       FROM program_action_log pal
       WHERE pal.instance_id = ANY($1::uuid[])
         AND pal.action_type = 'done'
       GROUP BY pal.instance_id`,
      [instanceIds],
    );
    for (const row of doneRes.rows) {
      if (row.last_done_at) {
        lastDoneByInstance.set(row.instance_id, row.last_done_at.toISOString());
      }
    }
  }

  return patientIds.map((patientUserId) => {
    const activeInstanceId = activeByPatient.get(patientUserId) ?? null;
    return {
      patientUserId,
      activeInstanceId,
      lastDoneAt: activeInstanceId ? (lastDoneByInstance.get(activeInstanceId) ?? null) : null,
      hasActiveDoctorProgram: activeInstanceId !== null,
    };
  });
}

async function getOnSupportPatientRef(patientUserId: string): Promise<ProactivePatientRef | null> {
  const res = await runWebappPgText<{ id: string; display_name: string | null }>(
    `SELECT pu.id, pu.display_name
     FROM doctor_patient_support dps
     JOIN platform_users pu ON pu.id = dps.patient_user_id
     WHERE dps.patient_user_id = $1::uuid
       AND dps.on_support = true
       AND pu.role = 'client'
       AND pu.merged_into_id IS NULL
       AND COALESCE(pu.is_archived, false) = false
     LIMIT 1`,
    [patientUserId],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    patientUserId: row.id,
    displayName: row.display_name?.trim() || "—",
  };
}

async function buildInsights(
  displayIana: string,
  limit: number,
  filterPatientIds?: readonly string[],
): Promise<ProactiveInsightRow[]> {
  let patients: ProactivePatientRef[];
  if (filterPatientIds?.length === 1) {
    const ref = await getOnSupportPatientRef(filterPatientIds[0]!);
    patients = ref ? [ref] : [];
  } else {
    patients = await listOnSupportPatients();
    if (filterPatientIds?.length) {
      const allowed = new Set(filterPatientIds);
      patients = patients.filter((p) => allowed.has(p.patientUserId));
    }
  }
  if (patients.length === 0) return [];

  const patientIds = patients.map((p) => p.patientUserId);
  const now = DateTime.now().setZone(displayIana);
  const wellbeingFrom = now
    .minus({ days: PROACTIVE_WELLBEING_LOW_STREAK_DAYS + 1 })
    .startOf("day")
    .toUTC()
    .toISO()!;
  const wellbeingTo = now.plus({ days: 1 }).startOf("day").toUTC().toISO()!;

  const [entries, activity] = await Promise.all([
    listWellbeingEntries(patientIds, wellbeingFrom, wellbeingTo),
    listProgramActivity(patientIds),
  ]);

  const wellbeing = detectWellbeingLowStreakInsights({
    patients,
    entries,
    iana: displayIana,
    now,
  });
  const inactivity = detectProgramInactivityInsights({
    patients,
    activity,
    now: DateTime.now(),
  });

  return mergeProactiveInsights([wellbeing, inactivity], limit);
}

export function createPgDoctorProactiveInsightsPort(): DoctorProactiveInsightsPort {
  return {
    async queryInsights({ limit, displayIana }) {
      const cap = Math.min(Math.max(limit, 1), DOCTOR_TODAY_PROACTIVE_INSIGHTS_PREVIEW_LIMIT);
      const all = await buildInsights(displayIana, BUILD_INSIGHTS_CAP);
      return { items: all.slice(0, cap), totalCount: all.length };
    },
    async listForPatient({ patientUserId, displayIana }) {
      return buildInsights(displayIana, BUILD_INSIGHTS_CAP, [patientUserId]);
    },
  };
}
