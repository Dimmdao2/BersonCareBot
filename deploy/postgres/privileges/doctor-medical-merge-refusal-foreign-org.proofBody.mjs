/**
 * Живое доказательство §18б в части «в ОБЕИХ учётках, но только в СВОЕЙ клинике» — для двух корней,
 * которых у прежнего прогона не было: записи отказа и чтения следа отказа.
 *
 * Оракул — канон `AUTH_AND_IDENTITY_CANON.md` §18б: «Единственный блокер слияния разбирает врач ТОЙ
 * организации, где возник конфликт». Оба корня — `SECURITY DEFINER` за швом
 * `app_seam_identity_lookup_owner`: RLS арендатора внутри них уже не действует, и принадлежность
 * строки клинике сверяет только сама дверь.
 *
 * Дорогие молчаливые отказы, которые ловит прогон (оба сегодня не меряет ничто):
 *
 *  Ч1 — ЧТЕНИЕ. Врач клиники Б со своим законным контекстом и известным `conflictId` клиники А
 *       получает снимок чужого отказа: ФИО обоих людей, их канонические контакты (почта, телефон),
 *       комментарий врача клиники А и обе учётки. Наружу это сегодня не выходит только потому, что
 *       второй заслон стоит в приложении (`pgPatientMergeCandidate.ts` сверяет `organizationId`
 *       снимка), — то есть персональные данные чужой клиники доезжают до процесса и держатся одной
 *       строкой TypeScript, а не стеной базы.
 *  Ч2 — ЗАПИСЬ. Врач клиники Б отказывает по конфликту клиники А: строка чужой клиники получает
 *       статус `dismissed`/`escalated`, его комментарий и его `resolved_by`, а при
 *       `supportRequested` в `admin_audit_log` под `organization_id` КЛИНИКИ А заводится обращение
 *       платформенным администраторам. Клиника А теряет свой разбор и не узнаёт об этом: маршрут
 *       `POST /api/doctor/account-merge-conflicts/[conflictId]` передаёт `conflictId` из URL в дверь
 *       без единой сверки организации — приложение здесь не подстраховывает вовсе.
 *
 * Слепые поломки: `refusal-read-any-org` (Ч1) и `refusal-write-any-org` (Ч2) снимают сверку в
 * соответствующей двери — прогон обязан покраснеть на каждой.
 *
 * Запускается не напрямую, а из `doctor-medical-merge-door.devDbProof.test.mjs`.
 */
import {
  clearDoctorContext,
  clinicsWithDoctors,
  connect,
  faultFromEnv,
  installCandidate,
  installCandidateNamedRootCapability,
  installDoctorContext,
  installDoctorNamedRootContext,
  staffCapability,
} from './doctor-medical-merge-door.proofHarness.mjs';

const TARGET = '00000000-0000-4000-8000-00000000fa01';
const DUPLICATE = '00000000-0000-4000-8000-00000000fa02';
const CONFLICT_A = '00000000-0000-4000-8000-00000000fa11';

const DOCTOR_A_COMMENT = 'Клиника А: это разные люди, я их обоих веду';
const DOCTOR_B_COMMENT = 'Чужой врач не должен записать сюда ничего';

const FAULT = faultFromEnv();
function say(line) {
  process.stdout.write(`${line}\n`);
}

async function openNamedRoot(client, doctor, identity, args) {
  const capability = await installCandidateNamedRootCapability(client, identity, 'app_staff');
  await installDoctorNamedRootContext(client, capability, doctor, args);
}

async function refuse(client, doctor, conflictId, comment, supportRequested) {
  const identity = 'app.refuse_staff_patient_medical_merge_conflict(uuid,uuid,text,boolean)';
  await openNamedRoot(client, doctor, identity, [
    { type: 'uuid', value: conflictId },
    { type: 'uuid', value: doctor.staff_id },
    { type: 'text', value: comment },
    { type: 'boolean', value: supportRequested },
  ]);
  const result = await client.query(
    `SELECT app.refuse_staff_patient_medical_merge_conflict(
       $1::uuid, $2::uuid, $3::text, $4::boolean
     ) AS resolved`,
    [conflictId, doctor.staff_id, comment, supportRequested],
  );
  await clearDoctorContext(client);
  return result.rows[0]?.resolved === true;
}

async function readRefusal(client, doctor, conflictId) {
  await openNamedRoot(client, doctor, 'app.read_staff_patient_medical_merge_refusal(uuid)', [
    conflictId,
  ]);
  const result = await client.query(
    `SELECT app.read_staff_patient_medical_merge_refusal($1::uuid) AS snapshot`,
    [conflictId],
  );
  await clearDoctorContext(client);
  return result.rows[0]?.snapshot ?? null;
}

async function main() {
  const { client, db, who } = await connect();
  say(`connected: db=${db} as=${who}`);
  await client.query('BEGIN');
  try {
    await installCandidate(client, FAULT, say);
    const [clinicA, clinicB] = await clinicsWithDoctors(client, 2, say);
    say(`clinic A (конфликт её) =${clinicA.org_id} doctor=${clinicA.staff_id}`);
    say(`clinic B (чужой врач)  =${clinicB.org_id} doctor=${clinicB.staff_id}`);

    for (const [id, name, kind, value] of [
      [TARGET, 'Ч1 учётка один', 'email', 'foreign-one@example.test'],
      [DUPLICATE, 'Ч1 учётка два', 'phone', '+79990000042'],
    ]) {
      await client.query(
        `INSERT INTO public.platform_users(id, display_name, role) VALUES ($1::uuid, $2, 'client')`,
        [id, name],
      );
      await client.query(
        `INSERT INTO public.user_contacts(
           platform_user_id, contact_kind, value_normalized, is_primary, source_origin
         ) VALUES ($1::uuid, $2, $3, true, 'direct')`,
        [id, kind, value],
      );
      await client.query(
        `INSERT INTO public.org_enrollments(organization_id, platform_user_id, status)
         VALUES ($1::uuid, $2::uuid, 'active')`,
        [clinicA.org_id, id],
      );
    }
    await client.query(
      `INSERT INTO public.patient_merge_candidates(
         id, organization_id, anchor_user_id, candidate_user_id, reason, status
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'medical_history:email_bind', 'pending')`,
      [CONFLICT_A, clinicA.org_id, TARGET, DUPLICATE],
    );
    say('fixture inserted (2 accounts of clinic A, one pending conflict of clinic A)');

    // --- Ч2: чужой врач отказывает по нетронутому конфликту соседней клиники ---
    const foreignRefusal = await refuse(client, clinicB, CONFLICT_A, DOCTOR_B_COMMENT, true);
    say(`doctor B refused clinic A's pending conflict, door returned: ${foreignRefusal}`);
    const after = await client.query(
      `SELECT status, doctor_comment, support_requested, resolved_by::text AS resolved_by,
              (SELECT count(*)::int FROM public.admin_audit_log
                WHERE details->>'conflictId' = $1::text) AS platform_requests
         FROM public.patient_merge_candidates WHERE id = $1::uuid`,
      [CONFLICT_A],
    );
    const row = after.rows[0];
    say(`clinic A's conflict after the foreign refusal: ${JSON.stringify(row)}`);
    if (foreignRefusal) {
      throw new Error("дверь ответила врачу ЧУЖОЙ организации успехом на отказ по конфликту клиники А");
    }
    if (row.status !== 'pending' || row.doctor_comment !== null || row.resolved_by !== null) {
      throw new Error(`строку клиники А переписал врач чужой организации: ${JSON.stringify(row)}`);
    }
    if (row.platform_requests !== 0) {
      throw new Error(
        'врач чужой организации завёл обращение платформенным администраторам под organization_id клиники А',
      );
    }

    // --- клиника А разбирает свой конфликт сама: след отказа появляется ---
    if (!(await refuse(client, clinicA, CONFLICT_A, DOCTOR_A_COMMENT, false))) {
      throw new Error('clinic A could not refuse its own conflict — фикстура не годится');
    }
    const ownSnapshot = await readRefusal(client, clinicA, CONFLICT_A);
    if (ownSnapshot?.doctorComment !== DOCTOR_A_COMMENT) {
      throw new Error('clinic A does not see its own refusal trace — фикстура не годится');
    }
    say(`clinic A sees its own trace: ${JSON.stringify(ownSnapshot?.doctorComment)}`);

    // --- след отказа виден с ОБЕИХ учёток и только своей клинике ---
    // Это тот же запрос, которым карточку пациента питает `listMedicalConflictRefusalsForUser`:
    // рантайм-роль врача читает таблицу напрямую, под своей RLS-политикой арендатора.
    const capability = await staffCapability(client);
    async function marksFor(doctor, userId) {
      await installDoctorContext(client, capability, doctor);
      const rows = await client.query(
        `SELECT count(*)::int AS marks
           FROM public.patient_merge_candidates
          WHERE organization_id = $1::uuid
            AND status IN ('dismissed', 'escalated')
            AND reason LIKE 'medical_history:%'
            AND (anchor_user_id = $2::uuid OR candidate_user_id = $2::uuid)`,
        [doctor.org_id, userId],
      );
      await clearDoctorContext(client);
      return rows.rows[0].marks;
    }
    const marks = {
      clinicA_target: await marksFor(clinicA, TARGET),
      clinicA_duplicate: await marksFor(clinicA, DUPLICATE),
      clinicB_target: await marksFor(clinicB, TARGET),
    };
    say(`refusal marks the doctor's patient card actually reads: ${JSON.stringify(marks)}`);
    if (marks.clinicA_target !== 1 || marks.clinicA_duplicate !== 1) {
      throw new Error(
        `след отказа читается не из обеих учёток: ${JSON.stringify(marks)} — §18б требует пометку в ОБЕИХ`,
      );
    }
    if (marks.clinicB_target !== 0) {
      throw new Error('врач чужой клиники видит пометку отказа в карточке пациента клиники А');
    }

    // --- Ч1: чужой врач читает след отказа соседней клиники ---
    const foreignSnapshot = await readRefusal(client, clinicB, CONFLICT_A);
    say(`doctor B read clinic A's refusal trace, door returned: ${JSON.stringify(foreignSnapshot)}`);
    if (foreignSnapshot !== null) {
      const contacts = (foreignSnapshot.parties ?? [])
        .flatMap((party) => (party.contacts ?? []).map((contact) => contact.value))
        .join(', ');
      throw new Error(
        `дверь отдала врачу ЧУЖОЙ организации след отказа клиники А: комментарий=${JSON.stringify(
          foreignSnapshot.doctorComment,
        )} контакты=[${contacts}] — §18б держит разбор за врачом СВОЕЙ организации`,
      );
    }

    // Машиночитаемая строка фактов: тест сверяет ЗНАЧЕНИЯ, а не английские фразы журнала.
    // Переформулировка любой диагностической строки выше не должна красить прогон (§10a: тест не
    // дублирует текст), а подмена самого факта — обязана.
    say(
      `FACTS: ${JSON.stringify({
        foreignRefusalAccepted: foreignRefusal,
        conflictAfterForeignRefusal: row,
        ownTraceComment: ownSnapshot?.doctorComment ?? null,
        marks,
        foreignTraceRead: foreignSnapshot,
      })}`,
    );
    say('RESULT: PASS — a doctor of another organization neither reads nor writes clinic A\'s refusal');
  } catch (error) {
    say(`RESULT: FAIL — ${error.code ? `${error.code} ` : ''}${error.message}`);
    process.exitCode = 1;
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    const residual = await client.query(
      `SELECT (SELECT count(*)::int FROM public.platform_users WHERE id IN ($1::uuid, $2::uuid))
            + (SELECT count(*)::int FROM public.patient_merge_candidates WHERE id IN ($3::uuid, $4::uuid))
              AS rows`,
      [TARGET, DUPLICATE, CONFLICT_A, CONFLICT_A],
    );
    say(`rolled back; fixture rows left in the database: ${residual.rows[0].rows}`);
    await client.end();
  }
}

main();
