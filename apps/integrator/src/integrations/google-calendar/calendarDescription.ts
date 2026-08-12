import { sql } from 'drizzle-orm';
import type { DbPort } from '../../kernel/contracts/index.js';
import { normalizeRuPhoneE164 } from '../../infra/phone/normalizeRuPhoneE164.js';
import { runIntegratorNamedRoot, runIntegratorSql } from '../../infra/db/runIntegratorSql.js';

export type GoogleCalendarDescriptionInput = {
  phoneNormalized?: string | null;
  clientComment?: string | null;
  staffComment?: string | null;
  isProblematic?: boolean;
  supportProgramTitle?: string | null;
  packageSessionLine?: string | null;
};

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

  const packageLine = input.packageSessionLine?.trim();
  if (packageLine) {
    if (lines.length > 0) lines.push('');
    lines.push(packageLine);
  }

  return lines.join('\n');
}

export async function resolveGoogleCalendarDescriptionContext(
  db: DbPort,
  input: {
    appointmentId: string;
    phoneNormalized?: string | null;
  },
): Promise<Omit<GoogleCalendarDescriptionInput, 'clientComment'>> {
  const phone = input.phoneNormalized?.trim() || null;
  const normalizedPhone = phone ? normalizeRuPhoneE164(phone) : null;
  const [profileRes, staffCommentRes] = await Promise.all([
    runIntegratorNamedRoot<{ is_problematic: boolean; problematic_note: string | null }>(
      db,
      'app.read_booking_calendar_patient_profile(uuid)',
      [input.appointmentId],
      sql`SELECT is_problematic, problematic_note
          FROM app.read_booking_calendar_patient_profile(${input.appointmentId}::uuid)`,
    ),
    runIntegratorNamedRoot<{ body: string | null }>(
      db,
      'app.read_booking_calendar_latest_staff_comment(uuid)',
      [input.appointmentId],
      sql`SELECT body
          FROM app.read_booking_calendar_latest_staff_comment(${input.appointmentId}::uuid)`,
    ),
  ]);

  let supportProgramTitle: string | null = null;
  if (normalizedPhone) {
    const userRes = await runIntegratorSql<{ id: string }>(
      db,
      sql`SELECT id::text
          FROM platform_users
          WHERE phone_normalized = ${normalizedPhone}
            AND merged_into_id IS NULL
          LIMIT 1`,
    );
    const platformUserId = userRes.rows[0]?.id;
    if (platformUserId) {
      const supportRes = await runIntegratorSql<{ title: string }>(
        db,
        sql`SELECT tpi.title
            FROM doctor_patient_support dps
            INNER JOIN treatment_program_instances tpi
              ON tpi.patient_user_id = dps.patient_user_id
             AND tpi.status = 'active'
            WHERE dps.patient_user_id = ${platformUserId}::uuid
              AND dps.on_support = true
            ORDER BY tpi.updated_at DESC NULLS LAST
            LIMIT 1`,
      );
      supportProgramTitle = supportRes.rows[0]?.title?.trim() || null;
    }
  }

  const profile = profileRes.rows[0];
  return {
    phoneNormalized: normalizedPhone ?? phone,
    staffComment:
      staffCommentRes.rows[0]?.body?.trim() || profile?.problematic_note?.trim() || null,
    isProblematic: profile?.is_problematic === true,
    supportProgramTitle,
  };
}

export async function buildGoogleCalendarDescriptionForSync(
  db: DbPort | undefined,
  input: {
    appointmentId: string;
    phoneNormalized?: string | null;
    clientComment?: string | null;
    packageSessionLine?: string | null;
  },
): Promise<string> {
  const phone = input.phoneNormalized?.trim() || null;
  let enriched: Omit<GoogleCalendarDescriptionInput, 'clientComment'> = {
    phoneNormalized: phone,
  };
  if (db) {
    try {
      enriched = await resolveGoogleCalendarDescriptionContext(db, {
        appointmentId: input.appointmentId,
        phoneNormalized: phone,
      });
    } catch {
      // Enrichment is best-effort.
    }
  }

  return buildGoogleCalendarDescription({
    phoneNormalized: enriched.phoneNormalized ?? phone,
    clientComment: input.clientComment ?? null,
    staffComment: enriched.staffComment ?? null,
    ...(enriched.isProblematic !== undefined ? { isProblematic: enriched.isProblematic } : {}),
    supportProgramTitle: enriched.supportProgramTitle ?? null,
    packageSessionLine: input.packageSessionLine ?? null,
  });
}
