/**
 * Живое доказательство §18б в части «СВОЕЙ организации»: медицинский конфликт разбирает врач той
 * организации, где он возник. Дверь `app.transfer_staff_approved_platform_user_merge_data` —
 * `SECURITY DEFINER`, внутри неё RLS арендатора уже не действует, поэтому принадлежность конфликта
 * организации врача сверяет сама дверь: `candidate.organization_id = app.current_org_id()`.
 *
 * Дорогой молчаливый отказ, который ловит прогон: врач клиники Б со своим законным рантайм-контекстом
 * и ИЗВЕСТНЫМ ему `conflictId` чужой клиники А проходит дверь чужого конфликта. Он не получает
 * ошибки и ничего не замечает, зато дверь от его имени ставит на строку клиники А отметку
 * «врач одобрил» — то есть подделывает согласие врача чужой организации. После этого второй нажим
 * (уже по своей строке) снимает последний блокер, и пара сливается целиком: медицинские и учётные
 * строки двух людей съезжаются без решения той клиники, которая их вела. Ни один участник этого
 * не видит — согласие выглядит как настоящее.
 *
 * Фикстура намеренно совпадает с законным двухклиничным прогоном: у пары история и pending-строка в
 * ОБЕИХ клиниках, у врача Б есть своя законная строка. Единственное отличие — какой `conflictId` он
 * подаёт. Значит прогон меряет ровно стену принадлежности, а не что-то соседнее.
 *
 * Слепая поломка `foreign-org-conflict` снимает эту сверку в двери — тогда прогон обязан покраснеть.
 *
 * Запускается не напрямую, а из `doctor-medical-merge-door.devDbProof.test.mjs`.
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

const TARGET = '00000000-0000-4000-8000-00000000f1a1';
const DUPLICATE = '00000000-0000-4000-8000-00000000f1a2';
const CONFLICT_A = '00000000-0000-4000-8000-00000000f1c1';
const CONFLICT_B = '00000000-0000-4000-8000-00000000f1c2';

const FAULT = faultFromEnv();
function say(line) {
  process.stdout.write(`${line}\n`);
}

async function main() {
  const { client, db, who } = await connect();
  say(`connected: db=${db} as=${who}`);

  await client.query('BEGIN');
  try {
    await installCandidate(client, FAULT, say);

    const capability = await staffCapability(client);
    const [clinicA, clinicB] = await clinicsWithDoctors(client, 2, say);
    say(`clinic A (конфликт её) =${clinicA.org_id} doctor=${clinicA.staff_id}`);
    say(`clinic B (чужой врач)  =${clinicB.org_id} doctor=${clinicB.staff_id}`);

    // --- фикстура: пара учёток, медицинская история с обеих сторон в ОБЕИХ клиниках ---
    // ФИО обеих сторон намеренно ОДИНАКОВО: предмет этого прогона — права и границы двери, а не
    // §18а. Разные подписи означали бы незакрытый вопрос человека, и дверь честно отказала бы
    // `fio_decision_required`, не дойдя до проверяемого здесь. Выбор ФИО проверяет отдельный
    // прогон `doctor-medical-merge-fio.proofBody.mjs`.
    for (const [id, name] of [
      [TARGET, 'F1 proof person'],
      [DUPLICATE, 'F1 proof person'],
    ]) {
      await client.query(
        `INSERT INTO public.platform_users(id, display_name, role) VALUES ($1::uuid, $2, 'client')`,
        [id, name],
      );
      for (const clinic of [clinicA, clinicB]) {
        await client.query(
          `INSERT INTO public.org_enrollments(organization_id, platform_user_id, status)
           VALUES ($1::uuid, $2::uuid, 'active')`,
          [clinic.org_id, id],
        );
        await client.query(
          `INSERT INTO public.clinical_visit(patient_user_id, visit_type, visited_at, created_by, organization_id)
           VALUES ($1::uuid, 'first', now(), $2::uuid, $3::uuid)`,
          [id, clinic.staff_id, clinic.org_id],
        );
      }
      await client.query(
        `INSERT INTO public.user_password_credentials(user_id, password_hash) VALUES ($1::uuid, 'argon2-f1-proof')`,
        [id],
      );
    }
    for (const [conflictId, clinic] of [
      [CONFLICT_A, clinicA],
      [CONFLICT_B, clinicB],
    ]) {
      await client.query(
        `INSERT INTO public.patient_merge_candidates(id, organization_id, anchor_user_id,
           candidate_user_id, reason, status)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'medical_history:projection', 'pending')`,
        [conflictId, clinic.org_id, TARGET, DUPLICATE],
      );
    }
    say(
      'fixture inserted (2 accounts, clinical history in BOTH clinics, one pending row per clinic)',
    );

    // --- врач клиники Б подаёт в дверь conflictId клиники А ---
    const runtimeB = await installDoctorContext(client, capability, clinicB);
    say(
      `doctor B runtime: session_user=${runtimeB.login} current_user=${runtimeB.role} org=${runtimeB.org}`,
    );
    if (runtimeB.org !== clinicB.org_id) {
      throw new Error(`doctor B runtime org is ${runtimeB.org}, expected ${clinicB.org_id}`);
    }
    const attempt = await mergePlatformUsersInTransaction(client, TARGET, DUPLICATE, 'projection', {
      medicalConflictApproval: {
        conflictId: CONFLICT_A,
        organizationId: clinicB.org_id,
        actorId: clinicB.staff_id,
        doctorComment: 'Чужой врач не должен пройти',
      },
      mergeContext: { actorId: clinicB.staff_id, source: 'doctor_medical_conflict_review' },
    });
    say(`doctor B pressed merge on clinic A's conflict, door returned: ${JSON.stringify(attempt)}`);

    await clearDoctorContext(client);
    const after = await client.query(
      `SELECT (SELECT merged_into_id::text FROM public.platform_users WHERE id = $2::uuid) AS duplicate_merged_into,
              (SELECT count(*)::int FROM public.user_password_credentials WHERE user_id = $2::uuid) AS duplicate_credentials,
              (SELECT count(*)::int FROM public.user_password_credentials WHERE user_id = $1::uuid) AS target_credentials,
              (SELECT status || '/' || COALESCE(payload->>'doctorApproved', 'null')
                 FROM public.patient_merge_candidates WHERE id = $3::uuid) AS clinic_a_row,
              -- Комментарий врача пишет ПЯТИАРГУМЕНТНАЯ дверь ДО того, как четырёхаргументная
              -- откажет по организации. Если сверять только статус и payload, снос стены именно в
              -- этой записи остаётся незамеченным: слияния нет, а запись в чужую строку уже есть.
              (SELECT doctor_comment
                 FROM public.patient_merge_candidates WHERE id = $3::uuid) AS clinic_a_comment,
              (SELECT status || '/' || COALESCE(payload->>'doctorApproved', 'null')
                 FROM public.patient_merge_candidates WHERE id = $4::uuid) AS clinic_b_row`,
      [TARGET, DUPLICATE, CONFLICT_A, CONFLICT_B],
    );
    say(`after the foreign attempt: ${JSON.stringify(after.rows[0])}`);

    const state = after.rows[0];
    if (attempt.mergeOutcome !== 'conflict_not_found') {
      throw new Error(
        `the door answered '${attempt.mergeOutcome}' to a doctor of another organization, expected 'conflict_not_found'`,
      );
    }
    if (state.clinic_a_row !== 'pending/null') {
      throw new Error(
        `clinic A's row is '${state.clinic_a_row}', expected an untouched 'pending/null' — a foreign doctor stamped its approval`,
      );
    }
    if (state.clinic_a_comment !== null) {
      throw new Error(
        `в строку клиники А лёг комментарий врача ЧУЖОЙ организации: ${JSON.stringify(
          state.clinic_a_comment,
        )} — решение врача имеет вес только в своей организации`,
      );
    }
    if (state.clinic_b_row !== 'pending/null') {
      throw new Error(
        `clinic B's own row is '${state.clinic_b_row}', expected an untouched 'pending/null'`,
      );
    }
    if (state.duplicate_merged_into !== null) {
      throw new Error('the pair was merged by a doctor of another organization');
    }
    if (state.duplicate_credentials !== 1 || state.target_credentials !== 1) {
      throw new Error(
        `identity rows moved: target=${state.target_credentials} duplicate=${state.duplicate_credentials}`,
      );
    }

    say(`FACTS: ${JSON.stringify({ attempt, state })}`);
    say(
      "RESULT: PASS — a doctor of another organization is refused and clinic A's conflict is untouched",
    );
  } catch (err) {
    say(`RESULT: FAIL — ${err.code ? `${err.code} ` : ''}${err.message}`);
    if (err.where) say(`  where: ${String(err.where)}`);
    if (err.detail) say(`  detail: ${err.detail}`);
    process.exitCode = 1;
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    const check = await client.query(
      `SELECT (SELECT count(*)::int FROM public.platform_users WHERE id IN ($1::uuid, $2::uuid))
            + (SELECT count(*)::int FROM public.patient_merge_candidates WHERE id IN ($3::uuid, $4::uuid))
              AS leftovers`,
      [TARGET, DUPLICATE, CONFLICT_A, CONFLICT_B],
    );
    say(`rolled back; fixture rows left in the database: ${check.rows[0].leftovers}`);
    say(`ROLLBACK_FACTS: ${JSON.stringify({ fixtureRows: check.rows[0].leftovers })}`);
    await client.end();
  }
}

main();
