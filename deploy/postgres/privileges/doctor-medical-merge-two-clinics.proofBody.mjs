/**
 * Живое доказательство Д1: у пары учёток медицинский конфликт В ДВУХ клиниках. Врач первой жмёт
 * «слить» — слияние ещё не может произойти, потому что блокер второй клиники снимает только её врач
 * (канон §18б: врач решает за свою организацию). Проверяется ровно то, чего не было:
 *
 *  1. врачу возвращается НЕ успех, а причина `awaiting_other_organization`;
 *  2. учётки НЕ слиты — `platform_users.merged_into_id` остаётся NULL;
 *  3. конфликт НЕ уходит с индикатора врача — строка его клиники остаётся `pending`, а модалка
 *     показывает `doctorApproved: true`, то есть «учтено, ждём вторую клинику»;
 *  4. врач второй клиники жмёт «слить» — слияние проходит целиком, и закрываются строки ОБЕИХ клиник.
 *
 * Уже случившийся отказ, который прогон ловит (F1 третьего круга аудита): дверь помечала строку
 * разобранной и возвращала `false`, движок честно отдавал `mergeCompleted:false`, а репозиторий это
 * значение выбрасывал и всегда возвращал `true` — маршрут отвечал `200 {"ok":true}`. Человек
 * оставался двумя учётками, а врачу отвечали так, будто слияние завершилось.
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

const TARGET = '00000000-0000-4000-8000-00000000d1a1';
const DUPLICATE = '00000000-0000-4000-8000-00000000d1a2';
const CONFLICT_A = '00000000-0000-4000-8000-00000000d1c1';
const CONFLICT_B = '00000000-0000-4000-8000-00000000d1c2';

const NEIGHBOUR_SCENARIOS = [
  { key: 'wrongOrg', prefix: 'd2' },
  { key: 'closed', prefix: 'd3' },
  { key: 'nonMedical', prefix: 'd4' },
  { key: 'notApproved', prefix: 'd5' },
  { key: 'wrongPair', prefix: 'd6' },
];

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

    const capability = await staffCapability(client);
    const [clinicA, clinicB, clinicC] = await clinicsWithDoctors(client, 3, say);
    say(`clinic A=${clinicA.org_id} doctor=${clinicA.staff_id}`);
    say(`clinic B=${clinicB.org_id} doctor=${clinicB.staff_id}`);

    // Пять независимых соседних строк: каждая отличается от настоящего решения клиники A ровно
    // одним предикатом. Врач B не вправе принять ни одну из них за разрешение своей пары.
    const neighbourAdmission = {};
    for (const scenario of NEIGHBOUR_SCENARIOS) {
      await client.query('SAVEPOINT neighbour_approval_probe');
      const probeTarget = `00000000-0000-4000-8000-00000000${scenario.prefix}01`;
      const probeDuplicate = `00000000-0000-4000-8000-00000000${scenario.prefix}02`;
      const probeOther = `00000000-0000-4000-8000-00000000${scenario.prefix}03`;
      const currentConflict = `00000000-0000-4000-8000-00000000${scenario.prefix}11`;
      const decoyConflict = `00000000-0000-4000-8000-00000000${scenario.prefix}12`;

      for (const id of [probeTarget, probeDuplicate, probeOther]) {
        await client.query(
          `INSERT INTO public.platform_users(id, display_name, role)
           VALUES ($1::uuid, $2, 'client')`,
          [id, `neighbour-${scenario.key}`],
        );
      }
      for (const id of [probeTarget, probeDuplicate]) {
        for (const clinic of [clinicA, clinicB]) {
          await client.query(
            `INSERT INTO public.org_enrollments(organization_id, platform_user_id, status)
             VALUES ($1::uuid, $2::uuid, 'active')`,
            [clinic.org_id, id],
          );
        }
        await client.query(
          `INSERT INTO public.clinical_visit(
             patient_user_id, visit_type, visited_at, created_by, organization_id
           ) VALUES ($1::uuid, 'first', now(), $2::uuid, $3::uuid)`,
          [id, clinicA.staff_id, clinicA.org_id],
        );
        await client.query(
          `INSERT INTO public.user_password_credentials(user_id, password_hash)
           VALUES ($1::uuid, 'argon2-neighbour-proof')`,
          [id],
        );
      }

      await client.query(
        `INSERT INTO public.patient_merge_candidates(
           id, organization_id, anchor_user_id, candidate_user_id, reason, status
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid,
                   'medical_history:neighbour-proof', 'pending')`,
        [currentConflict, clinicB.org_id, probeTarget, probeDuplicate],
      );
      await client.query(
        `INSERT INTO public.patient_merge_candidates(
           id, organization_id, anchor_user_id, candidate_user_id, reason, status, payload
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::jsonb)`,
        [
          decoyConflict,
          scenario.key === 'wrongOrg' ? clinicC.org_id : clinicA.org_id,
          probeTarget,
          scenario.key === 'wrongPair' ? probeOther : probeDuplicate,
          scenario.key === 'nonMedical' ? 'email_bind' : 'medical_history:neighbour-proof',
          scenario.key === 'closed' ? 'dismissed' : 'resolved',
          scenario.key === 'notApproved' ? '{}' : '{"doctorApproved":true}',
        ],
      );

      await installDoctorContext(client, capability, clinicB);
      const probe = await mergePlatformUsersInTransaction(
        client,
        probeTarget,
        probeDuplicate,
        'neighbour-proof',
        {
          medicalConflictApproval: {
            conflictId: currentConflict,
            organizationId: clinicB.org_id,
            actorId: clinicB.staff_id,
            doctorComment: `Клиника B: ${scenario.key}`,
          },
          mergeContext: {
            actorId: clinicB.staff_id,
            source: 'doctor_medical_conflict_review',
          },
        },
      );
      await clearDoctorContext(client);
      const probeState = await client.query(
        `SELECT merged_into_id::text AS duplicate_merged_into
           FROM public.platform_users WHERE id = $1::uuid`,
        [probeDuplicate],
      );
      neighbourAdmission[scenario.key] = {
        outcome: probe.mergeOutcome,
        duplicateMergedInto: probeState.rows[0].duplicate_merged_into,
      };
      await client.query('ROLLBACK TO SAVEPOINT neighbour_approval_probe');
      await client.query('RELEASE SAVEPOINT neighbour_approval_probe');
    }
    say(`neighbour approval admission: ${JSON.stringify(neighbourAdmission)}`);

    // --- фикстура: одна пара учёток, медицинская история с обеих сторон в ОБЕИХ клиниках ---
    // ФИО обеих сторон намеренно ОДИНАКОВО: предмет этого прогона — права и границы двери, а не
    // §18а. Разные подписи означали бы незакрытый вопрос человека, и дверь честно отказала бы
    // `fio_decision_required`, не дойдя до проверяемого здесь. Выбор ФИО проверяет отдельный
    // прогон `doctor-medical-merge-fio.proofBody.mjs`.
    for (const [id, name] of [
      [TARGET, 'D1 proof person'],
      [DUPLICATE, 'D1 proof person'],
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
        `INSERT INTO public.user_password_credentials(user_id, password_hash) VALUES ($1::uuid, 'argon2-d1-proof')`,
        [id],
      );
    }
    // Ровно то, что завёл бы гейт: по одной pending-строке на КАЖДУЮ клинику конфликта.
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

    // --- шаг 1: «слить» жмёт врач клиники A ---
    const runtimeA = await installDoctorContext(client, capability, clinicA);
    say(
      `doctor A runtime: session_user=${runtimeA.login} current_user=${runtimeA.role} org=${runtimeA.org}`,
    );
    const first = await mergePlatformUsersInTransaction(client, TARGET, DUPLICATE, 'projection', {
      medicalConflictApproval: {
        conflictId: CONFLICT_A,
        organizationId: clinicA.org_id,
        actorId: clinicA.staff_id,
        doctorComment: 'Клиника A подтверждает совпадение',
      },
      mergeContext: { actorId: clinicA.staff_id, source: 'doctor_medical_conflict_review' },
    });
    say(`doctor A merge returned: ${JSON.stringify(first)}`);

    // Все четыре красных входа питаются этим одним pending-набором.
    const indicator = await client.query(
      `SELECT count(*)::int AS pending
         FROM public.patient_merge_candidates
        WHERE id = $2::uuid AND organization_id = $1::uuid
          AND status = 'pending' AND reason LIKE 'medical_history:%'`,
      [clinicA.org_id, CONFLICT_A],
    );
    say(`doctor A pending conflicts after decision: ${indicator.rows[0].pending}`);
    await clearDoctorContext(client);
    const afterFirst = await client.query(
      `SELECT (SELECT merged_into_id::text FROM public.platform_users WHERE id = $2::uuid) AS duplicate_merged_into,
              (SELECT count(*)::int FROM public.user_password_credentials WHERE user_id = $2::uuid) AS duplicate_credentials,
              (SELECT count(*)::int FROM public.user_password_credentials WHERE user_id = $1::uuid) AS target_credentials,
              (SELECT status || '/' || COALESCE(payload->>'doctorApproved', 'null') || '/' || COALESCE(doctor_comment, '')
                 FROM public.patient_merge_candidates WHERE id = $3::uuid) AS clinic_a_row,
              (SELECT status || '/' || COALESCE(payload->>'doctorApproved', 'null')
                 FROM public.patient_merge_candidates WHERE id = $4::uuid) AS clinic_b_row`,
      [TARGET, DUPLICATE, CONFLICT_A, CONFLICT_B],
    );
    say(`after doctor A pressed merge: ${JSON.stringify(afterFirst.rows[0])}`);

    const a = afterFirst.rows[0];
    if (first.mergeOutcome !== 'awaiting_other_organization') {
      throw new Error(
        `doctor A got '${first.mergeOutcome}', expected 'awaiting_other_organization'`,
      );
    }
    if (a.duplicate_merged_into !== null) {
      throw new Error('the pair was merged while the second clinic still blocks it');
    }
    if (a.duplicate_credentials !== 1 || a.target_credentials !== 1) {
      throw new Error('identity rows moved even though no merge happened');
    }
    if (a.clinic_a_row !== 'resolved/true/Клиника A подтверждает совпадение') {
      throw new Error(
        `clinic A row is '${a.clinic_a_row}', expected a resolved approval with its comment`,
      );
    }
    if (a.clinic_b_row !== 'pending/null') {
      throw new Error(`clinic B row is '${a.clinic_b_row}', expected an untouched 'pending/null'`);
    }
    if (indicator.rows[0].pending !== 0) {
      throw new Error(
        `clinic A indicators still see ${indicator.rows[0].pending} pending conflicts`,
      );
    }

    // --- шаг 2: «слить» жмёт врач клиники B ---
    const runtimeB = await installDoctorContext(client, capability, clinicB);
    say(
      `doctor B runtime: session_user=${runtimeB.login} current_user=${runtimeB.role} org=${runtimeB.org}`,
    );
    const second = await mergePlatformUsersInTransaction(client, TARGET, DUPLICATE, 'projection', {
      medicalConflictApproval: {
        conflictId: CONFLICT_B,
        organizationId: clinicB.org_id,
        actorId: clinicB.staff_id,
        doctorComment: 'Клиника B подтверждает совпадение',
      },
      mergeContext: { actorId: clinicB.staff_id, source: 'doctor_medical_conflict_review' },
    });
    say(`doctor B merge returned: ${JSON.stringify(second)}`);

    await clearDoctorContext(client);
    const afterSecond = await client.query(
      `SELECT (SELECT merged_into_id::text FROM public.platform_users WHERE id = $2::uuid) AS duplicate_merged_into,
              (SELECT count(*)::int FROM public.user_password_credentials WHERE user_id = $2::uuid) AS duplicate_credentials,
              (SELECT status FROM public.patient_merge_candidates WHERE id = $3::uuid) AS clinic_a_row,
              (SELECT status FROM public.patient_merge_candidates WHERE id = $4::uuid) AS clinic_b_row,
              (SELECT count(*)::int FROM public.clinical_visit WHERE patient_user_id = $1::uuid) AS target_visits`,
      [TARGET, DUPLICATE, CONFLICT_A, CONFLICT_B],
    );
    say(`after doctor B pressed merge: ${JSON.stringify(afterSecond.rows[0])}`);

    const b = afterSecond.rows[0];
    if (second.mergeOutcome !== 'merged') {
      throw new Error(`doctor B got '${second.mergeOutcome}', expected 'merged'`);
    }
    if (b.duplicate_merged_into !== TARGET) throw new Error('the pair did not actually merge');
    if (b.clinic_a_row !== 'resolved' || b.clinic_b_row !== 'resolved') {
      throw new Error(
        `stale indicator: clinic A '${b.clinic_a_row}', clinic B '${b.clinic_b_row}'`,
      );
    }

    say(
      `FACTS: ${JSON.stringify({
        neighbourAdmission,
        firstOutcome: first.mergeOutcome,
        pendingAfterFirst: indicator.rows[0].pending,
        afterFirst: a,
        secondOutcome: second.mergeOutcome,
        afterSecond: b,
      })}`,
    );
    say(
      'RESULT: PASS — the first clinic got a truthful refusal, the second one completed the merge',
    );
  } catch (err) {
    say(`RESULT: FAIL — ${err.code ? `${err.code} ` : ''}${err.message}`);
    if (err.where) say(`  where: ${String(err.where)}`);
    if (err.detail) say(`  detail: ${err.detail}`);
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
