import type { DbPort } from '../../kernel/contracts/index.js';
import { normalizeRuPhoneE164 } from '../../infra/phone/normalizeRuPhoneE164.js';
import { resolvePlatformUserIdForRubitimeBooking } from '../../infra/db/repos/resolvePlatformUserIdForRubitimeBooking.js';

const RUBITIME_CLIENT_COMMENT_KEYS = ['comment'] as const;

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function firstNonEmptyFromRecord(
  record: Record<string, unknown> | undefined,
  keys: readonly string[],
): string | undefined {
  if (!record) return undefined;
  for (const k of keys) {
    const s = asString(record[k]);
    if (s) return s;
  }
  return undefined;
}

export type GoogleCalendarDescriptionInput = {
  phoneNormalized?: string | null;
  clientComment?: string | null;
  staffComment?: string | null;
  isProblematic?: boolean;
  supportProgramTitle?: string | null;
};

/** Первая строка описания: `#+79001234567`. */
export function formatPhoneHashtag(phoneNormalized: string | null | undefined): string | null {
  const raw = phoneNormalized?.trim();
  if (!raw) return null;
  const withPlus = raw.startsWith('+') ? raw : `+${raw}`;
  return `#${withPlus}`;
}

export function buildGoogleCalendarDescription(input: GoogleCalendarDescriptionInput): string {
  const lines: string[] = [];
  const phoneTag = formatPhoneHashtag(input.phoneNormalized);
  if (phoneTag) lines.push(phoneTag);

  const client = input.clientComment?.trim();
  if (client) {
    if (lines.length > 0) lines.push('');
    lines.push(client);
  }

  const staff = input.staffComment?.trim();
  const staffBlock: string[] = [];
  if (staff) staffBlock.push(staff);
  if (input.isProblematic) staffBlock.push('Проблемный');
  if (staffBlock.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(...staffBlock);
  }

  const program = input.supportProgramTitle?.trim();
  if (program) {
    if (lines.length > 0) lines.push('');
    lines.push(`На сопровождении: ${program}`);
  }

  return lines.join('\n');
}

async function resolveCanonicalAppointmentId(
  db: DbPort,
  rubRecordId: string,
): Promise<string | null> {
  if (rubRecordId.startsWith('be:')) {
    const id = rubRecordId.slice(3).trim();
    return id.length > 0 ? id : null;
  }
  const mapped = await db.query<{ canonical_id: string }>(
    `SELECT canonical_id::text
     FROM be_external_entity_mappings
     WHERE entity_type = 'appointment'
       AND external_system = 'rubitime'
       AND external_id = $1
     LIMIT 1`,
    [rubRecordId],
  );
  return mapped.rows[0]?.canonical_id ?? null;
}

export async function resolveGoogleCalendarDescriptionContext(
  db: DbPort,
  input: {
    rubRecordId: string;
    phoneNormalized?: string | null;
  },
): Promise<Omit<GoogleCalendarDescriptionInput, 'clientComment'>> {
  const phone = input.phoneNormalized?.trim() || null;
  const platformUserId = await resolvePlatformUserIdForRubitimeBooking(db, phone, null);
  if (!platformUserId) {
    return { phoneNormalized: phone };
  }

  const appointmentId = await resolveCanonicalAppointmentId(db, input.rubRecordId);

  const [profileRes, supportRes, staffCommentRes] = await Promise.all([
    db.query<{ is_problematic: boolean; problematic_note: string | null }>(
      `SELECT is_problematic, problematic_note
       FROM be_patient_booking_profiles
       WHERE platform_user_id = $1::uuid
       LIMIT 1`,
      [platformUserId],
    ),
    db.query<{ title: string }>(
      `SELECT tpi.title
       FROM doctor_patient_support dps
       INNER JOIN treatment_program_instances tpi
         ON tpi.patient_user_id = dps.patient_user_id
        AND tpi.status = 'active'
       WHERE dps.patient_user_id = $1::uuid
         AND dps.on_support = true
       ORDER BY tpi.updated_at DESC NULLS LAST
       LIMIT 1`,
      [platformUserId],
    ),
    appointmentId
      ? db.query<{ body: string }>(
          `SELECT body
           FROM be_appointment_staff_comments
           WHERE appointment_id = $1::uuid
           ORDER BY updated_at DESC
           LIMIT 1`,
          [appointmentId],
        )
      : Promise.resolve({ rows: [] as { body: string }[] }),
  ]);

  const profile = profileRes.rows[0];
  const appointmentStaff = staffCommentRes.rows[0]?.body?.trim() || null;
  const profileNote = profile?.problematic_note?.trim() || null;
  const staffComment = appointmentStaff ?? profileNote;

  return {
    phoneNormalized: phone,
    staffComment,
    isProblematic: profile?.is_problematic === true,
    supportProgramTitle: supportRes.rows[0]?.title?.trim() || null,
  };
}

export async function buildGoogleCalendarDescriptionForSync(
  db: DbPort | undefined,
  input: {
    rubRecordId: string;
    record?: Record<string, unknown>;
    phoneNormalized?: string | null;
  },
): Promise<string> {
  const recordPhone = asString(input.record?.phone);
  const phone =
    input.phoneNormalized?.trim()
    || (recordPhone ? normalizeRuPhoneE164(recordPhone) : null);
  const clientComment = firstNonEmptyFromRecord(input.record, RUBITIME_CLIENT_COMMENT_KEYS);

  let enriched: Omit<GoogleCalendarDescriptionInput, 'clientComment'> = { phoneNormalized: phone };
  if (db) {
    try {
      enriched = await resolveGoogleCalendarDescriptionContext(db, {
        rubRecordId: input.rubRecordId,
        phoneNormalized: phone,
      });
    } catch {
      // Enrichment is best-effort; Rubitime record fields still apply.
    }
  }

  return buildGoogleCalendarDescription({
    phoneNormalized: enriched.phoneNormalized ?? phone,
    clientComment,
    staffComment: enriched.staffComment,
    isProblematic: enriched.isProblematic,
    supportProgramTitle: enriched.supportProgramTitle,
  });
}
