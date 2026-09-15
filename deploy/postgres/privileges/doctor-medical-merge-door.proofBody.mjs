/**
 * Живое доказательство: врач нажимает «Слить» на медицинском конфликте, и слияние проходит целиком
 * под НАСТОЯЩЕЙ рантайм-ролью врача, без единого `permission denied`.
 *
 * Тело proof'а. Запускается не напрямую, а из `doctor-medical-merge-door.devDbProof.test.mjs`:
 * ему нужен процесс от OS-пользователя `postgres` (peer-сокет), потому что кандидатная миграция и
 * кандидатные права ставятся в ТОЙ ЖЕ транзакции, в которой затем работает роль врача, а сама
 * транзакция всегда заканчивается `ROLLBACK`. Ничего не коммитится, ledger миграций не трогается.
 * Установка кандидата и роль врача — общие, они живут в `doctor-medical-merge-door.proofHarness.mjs`.
 *
 * Ловит уже случившийся отказ D2/E1: идентификационно-аутентификационная часть переноса выполняется
 * вне двери `SECURITY DEFINER`, и «Слить» падает на `permission denied for table
 * user_password_credentials` — молча для журнала и дорого для врача, потому что конфликт остаётся
 * неразобранным, а пациент — раздвоенным.
 */
import { mergePlatformUsersInTransaction } from '@bersoncare/platform-merge';
import {
  clearDoctorContext,
  clinicsWithDoctors,
  connect,
  faultFromEnv,
  installCandidate,
  installDoctorContext,
  staffCapability,
} from './doctor-medical-merge-door.proofHarness.mjs';

const TARGET = '00000000-0000-4000-8000-00000000e1a1';
const DUPLICATE = '00000000-0000-4000-8000-00000000e1a2';
const CONFLICT = '00000000-0000-4000-8000-00000000e1c1';

const FAULT = faultFromEnv();
const log = [];
function say(line) {
  log.push(line);
  process.stdout.write(`${line}\n`);
}

async function main() {
  const { client, db, who } = await connect();
  say(`connected: db=${db} as=${who}`);

  await client.query('BEGIN');
  try {
    await installCandidate(client, FAULT, say);

    // --- fixture: one clinic, its doctor, two patient accounts with a real medical conflict ---
    const capability = await staffCapability(client);
    const [clinic] = await clinicsWithDoctors(client, 1, say);
    say(`fixture clinic=${clinic.org_id} doctor=${clinic.staff_id} login=${capability.login}`);

    // ФИО обеих сторон намеренно ОДИНАКОВО: предмет этого прогона — права и границы двери, а не
    // §18а. Разные подписи означали бы незакрытый вопрос человека, и дверь честно отказала бы
    // `fio_decision_required`, не дойдя до проверяемого здесь. Выбор ФИО проверяет отдельный
    // прогон `doctor-medical-merge-fio.proofBody.mjs`.
    for (const [id, name] of [
      [TARGET, 'E1 proof person'],
      [DUPLICATE, 'E1 proof person'],
    ]) {
      await client.query(
        `INSERT INTO public.platform_users(id, display_name, role) VALUES ($1::uuid, $2, 'client')`,
        [id, name],
      );
      await client.query(
        `INSERT INTO public.org_enrollments(organization_id, platform_user_id, status)
         VALUES ($1::uuid, $2::uuid, 'active')`,
        [clinic.org_id, id],
      );
      // Qualifying medical history on BOTH sides in the SAME clinic == the real blocker.
      await client.query(
        `INSERT INTO public.clinical_visit(patient_user_id, visit_type, visited_at, created_by, organization_id)
         VALUES ($1::uuid, 'first', now(), $2::uuid, $3::uuid)`,
        [id, clinic.staff_id, clinic.org_id],
      );
      // Identity/auth rows: the tables app_staff must never be able to touch.
      await client.query(
        `INSERT INTO public.user_password_credentials(user_id, password_hash) VALUES ($1::uuid, 'argon2-e1-proof')`,
        [id],
      );
      await client.query(
        `INSERT INTO public.email_send_cooldowns(user_id, email_normalized, last_sent_at)
         VALUES ($1::uuid, 'e1-proof@example.test', now())`,
        [id],
      );
      await client.query(
        `INSERT INTO public.user_channel_preferences(user_id, platform_user_id, channel_code, is_preferred_for_auth)
         VALUES ($1::text, $1::uuid, 'telegram', true)`,
        [id],
      );
    }
    await client.query(
      `INSERT INTO public.patient_merge_candidates(id, organization_id, anchor_user_id, candidate_user_id, reason, status)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'medical_history:projection', 'pending')`,
      [CONFLICT, clinic.org_id, TARGET, DUPLICATE],
    );
    say('fixture rows inserted (2 accounts, clinical history on both sides, pending conflict)');

    // --- the doctor runtime role, exactly as the webapp opens it ---
    const runtime = await installDoctorContext(client, capability, clinic);
    say(
      `runtime role installed: session_user=${runtime.login} current_user=${runtime.role} org=${runtime.org}`,
    );

    // --- the actual product call behind the doctor's "Слить" button ---
    const result = await mergePlatformUsersInTransaction(client, TARGET, DUPLICATE, 'projection', {
      medicalConflictApproval: {
        conflictId: CONFLICT,
        organizationId: clinic.org_id,
        actorId: clinic.staff_id,
        doctorComment: 'Один клиент, подтверждено врачом',
      },
      mergeContext: { actorId: clinic.staff_id, source: 'doctor_medical_conflict_review' },
    });
    say(`merge returned: ${JSON.stringify(result)}`);

    // Back to the audit seat: app_staff deliberately cannot read the identity tables at all,
    // so the post-merge inspection must not pretend to be the doctor.
    await clearDoctorContext(client);
    const after = await client.query(
      `SELECT (SELECT merged_into_id::text FROM public.platform_users WHERE id = $2::uuid) AS duplicate_merged_into,
              (SELECT count(*)::int FROM public.user_password_credentials WHERE user_id = $2::uuid) AS duplicate_credentials,
              (SELECT count(*)::int FROM public.clinical_visit WHERE patient_user_id = $1::uuid) AS target_visits,
              (SELECT status FROM public.patient_merge_candidates WHERE id = $3::uuid) AS conflict_status`,
      [TARGET, DUPLICATE, CONFLICT],
    );
    say(`after merge: ${JSON.stringify(after.rows[0])}`);
    say(
      `FACTS: ${JSON.stringify({
        clinicOrg: clinic.org_id,
        runtime,
        mergeOutcome: result.mergeOutcome,
        state: after.rows[0],
      })}`,
    );
    say('RESULT: PASS — merge completed under the doctor runtime role, no privilege refusal');
  } catch (err) {
    say(`RESULT: FAIL — ${err.code ? `${err.code} ` : ''}${err.message}`);
    if (err.where) say(`  where: ${String(err.where)}`);
    if (err.detail) say(`  detail: ${err.detail}`);
    if (err.hint) say(`  hint: ${err.hint}`);
    process.exitCode = 1;
  } finally {
    await client.query('ROLLBACK');
    const check = await client.query(
      `SELECT count(*)::int AS leftovers FROM public.platform_users WHERE id IN ($1::uuid, $2::uuid)`,
      [TARGET, DUPLICATE],
    );
    say(`rolled back; fixture rows left in the database: ${check.rows[0].leftovers}`);
    say(`ROLLBACK_FACTS: ${JSON.stringify({ fixtureRows: check.rows[0].leftovers })}`);
    await client.end();
  }
}

main();
