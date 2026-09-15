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
/** Третья учётка той же клиники — нужна, чтобы завести ещё две строки БЕЗ нарушения
 * уникального индекса пары (`uq_patient_merge_candidates_org_pending_unordered_pair`). */
const THIRD = '00000000-0000-4000-8000-00000000fa03';
/** Конфликт своей клиники, который врач ещё НЕ разобрал: следа отказа у него быть не может. */
const CONFLICT_PENDING = '00000000-0000-4000-8000-00000000fa12';
/** Разобранный кандидат своей клиники, но НЕ медицинский: Э4c про него ничего не обещает. */
const CONFLICT_NONMEDICAL = '00000000-0000-4000-8000-00000000fa13';
/**
 * Немедицинский кандидат, который ЕЩЁ НЕ разобран. Нужен, чтобы отделить предикат рода данных от
 * предиката состояния: на разобранной строке фильтр статуса закрывает дверь первым, и снятие
 * `reason LIKE 'medical_history:%'` остаётся незаметным.
 */
const CONFLICT_PENDING_NONMEDICAL = '00000000-0000-4000-8000-00000000fa14';

const DOCTOR_A_COMMENT = 'Клиника А: это разные люди, я их обоих веду';
const DOCTOR_B_COMMENT = 'Чужой врач не должен записать сюда ничего';
const NONMEDICAL_COMMENT = 'Разбор не про медицинские данные';

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

/**
 * Пятиаргументная дверь подтверждения. Именованным корнем порта она НЕ является — внутри нет
 * `require_accepted_context`, её зовёт рантайм-роль врача под своим обычным принципалом
 * (`pgPlatformUserMerge.ts`). Поэтому здесь ставится тот же контекст врача, а не оснастка корня.
 */
async function approve(client, doctor, conflictId, targetId, duplicateId, comment) {
  const capability = await staffCapability(client);
  await installDoctorContext(client, capability, doctor);
  const result = await client.query(
    `SELECT app.transfer_staff_approved_platform_user_merge_data(
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text
     ) AS outcome`,
    [conflictId, targetId, duplicateId, doctor.staff_id, comment],
  );
  await clearDoctorContext(client);
  return result.rows[0]?.outcome ?? null;
}

/** Ожидаемый отказ двери: возвращаем код ошибки, а не роняем прогон. */
async function refusedWith(client, run) {
  await client.query('SAVEPOINT door_probe');
  try {
    await run();
    await client.query('RELEASE SAVEPOINT door_probe');
    return null;
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT door_probe');
    await clearDoctorContext(client).catch(() => {});
    return error.code ?? String(error.message ?? error);
  }
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
      [THIRD, 'Ч1 учётка три', 'email', 'foreign-three@example.test'],
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
    // Две строки СВОЕЙ клиники, по которым дверь чтения обязана молчать: первая ещё не разобрана,
    // вторая разобрана, но она не про медицинские данные. Без них снятие предикатов `status` и
    // `reason` в читающем корне нечем поймать — состояния просто нет в фикстуре (находки F1/F2
    // четвёртого круга аудита).
    await client.query(
      `INSERT INTO public.patient_merge_candidates(
         id, organization_id, anchor_user_id, candidate_user_id, reason, status
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'medical_history:phone_bind', 'pending')`,
      [CONFLICT_PENDING, clinicA.org_id, TARGET, THIRD],
    );
    await client.query(
      `INSERT INTO public.patient_merge_candidates(
         id, organization_id, anchor_user_id, candidate_user_id, reason, status,
         doctor_comment, resolved_at
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'email_bind', 'dismissed',
                 $5::text, pg_catalog.now())`,
      [CONFLICT_NONMEDICAL, clinicA.org_id, DUPLICATE, THIRD, NONMEDICAL_COMMENT],
    );
    await client.query(
      `INSERT INTO public.patient_merge_candidates(
         id, organization_id, anchor_user_id, candidate_user_id, reason, status
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'email_bind', 'pending')`,
      // Пара берётся ТРЕТЬЯ: частичный уникальный индекс `uq_patient_merge_candidates_org_pending_pair`
      // держит одну незакрытую строку на пару учёток в клинике независимо от рода данных.
      [CONFLICT_PENDING_NONMEDICAL, clinicA.org_id, DUPLICATE, THIRD],
    );
    say('fixture inserted (3 accounts of clinic A; conflicts: one pending medical, one pending medical spare, one dismissed non-medical)');

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
      throw new Error(
        'дверь ответила врачу ЧУЖОЙ организации успехом на отказ по конфликту клиники А',
      );
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
    say(
      `doctor B read clinic A's refusal trace, door returned: ${JSON.stringify(foreignSnapshot)}`,
    );
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

    // --- Ч3: своя клиника, но состояние, которого след отказа иметь не может ---
    // Читает СВОЙ врач со своим законным контекстом: стена организации тут ни при чём, и если
    // дверь ответит снимком, покраснеет именно предикат состояния, а не предикат клиники.
    const pendingTraceRead = await readRefusal(client, clinicA, CONFLICT_PENDING);
    say(`clinic A asked for a trace of its own UNRESOLVED conflict: ${JSON.stringify(pendingTraceRead)}`);
    if (pendingTraceRead !== null) {
      throw new Error(
        `дверь отдала след отказа по конфликту в статусе '${pendingTraceRead.status}' — решения врача по нему ещё не было`,
      );
    }
    const nonMedicalTraceRead = await readRefusal(client, clinicA, CONFLICT_NONMEDICAL);
    say(`clinic A asked for a trace of its own NON-MEDICAL candidate: ${JSON.stringify(nonMedicalTraceRead)}`);
    if (nonMedicalTraceRead !== null) {
      throw new Error(
        `дверь отдала немедицинский разбор как медицинский след отказа: комментарий=${JSON.stringify(
          nonMedicalTraceRead.doctorComment,
        )} — Э4c живёт внутри §18б, про медицинские данные`,
      );
    }

    // --- Ч4: допуск к решению — что дверь обязана ОТКАЗАТЬ ---
    // Проверяется не поведение «после решения», а сам допуск: обязателен ли комментарий, та ли
    // строка выбрана, в том ли она состоянии и про те ли это данные. Каждая проверка стережёт один
    // названный предикат двери (перечень — в шапке `doctor-medical-merge-door.devDbProof.test.mjs`).
    const admission = {
      // Комментарий врача обязателен в ОБЕИХ дверях: решение без объяснения не решение.
      emptyCommentRefusal: await refusedWith(client, () =>
        refuse(client, clinicA, CONFLICT_PENDING, '   ', false),
      ),
      emptyCommentApproval: await refusedWith(client, () =>
        approve(client, clinicA, CONFLICT_PENDING, TARGET, THIRD, '  '),
      ),
      // Уже разобранный конфликт второй раз не разбирается ни одной из дверей.
      secondRefusalOfResolved: await refuse(client, clinicA, CONFLICT_A, 'повторный отказ', false),
      approvalOfResolved: await approve(
        client, clinicA, CONFLICT_A, TARGET, DUPLICATE, 'повторное подтверждение',
      ),
      // Немедицинский кандидат через медицинскую дверь не проходит вовсе — и в разобранном виде,
      // и в НЕразобранном: иначе фильтр статуса закрывает дверь раньше и род данных не проверяется.
      refusalOfNonMedical: await refuse(client, clinicA, CONFLICT_NONMEDICAL, 'не медицина', false),
      approvalOfNonMedical: await approve(
        client, clinicA, CONFLICT_NONMEDICAL, DUPLICATE, THIRD, 'не медицина',
      ),
      refusalOfPendingNonMedical: await refuse(
        client, clinicA, CONFLICT_PENDING_NONMEDICAL, 'не медицина, но ещё открыт', false,
      ),
      approvalOfPendingNonMedical: await approve(
        client, clinicA, CONFLICT_PENDING_NONMEDICAL, DUPLICATE, THIRD, 'не медицина, но открыт',
      ),
    };
    say(`admission gate answers: ${JSON.stringify(admission)}`);

    // Соседние строки той же клиники обязаны остаться нетронутыми: без сверки `id` дверь отказа
    // закрыла бы своим комментарием ВЕСЬ разбор клиники разом.
    const neighbours = await client.query(
      `SELECT id::text AS id, status, doctor_comment, resolved_by::text AS resolved_by
         FROM public.patient_merge_candidates
        WHERE id = ANY($1::uuid[])
        ORDER BY id`,
      [[CONFLICT_PENDING, CONFLICT_NONMEDICAL, CONFLICT_PENDING_NONMEDICAL, CONFLICT_A]],
    );
    const neighbourNames = {
      [CONFLICT_PENDING]: 'pending',
      [CONFLICT_NONMEDICAL]: 'nonMedical',
      [CONFLICT_PENDING_NONMEDICAL]: 'pendingNonMedical',
      [CONFLICT_A]: 'ownResolved',
    };
    const neighbourRows = Object.fromEntries(
      neighbours.rows.map((row) => [
        neighbourNames[row.id],
        {
          status: row.status,
          doctor_comment: row.doctor_comment,
          // Не сам идентификатор: он приезжает из живой базы DEV и в утверждении был бы привязкой к
          // данным стенда. Значение здесь — кто именно закрыл строку: свой врач или никто.
          resolvedBy:
            row.resolved_by === null
              ? null
              : row.resolved_by === clinicA.staff_id
                ? 'clinicA_doctor'
                : 'someone_else',
        },
      ]),
    );
    say(`neighbour rows after every decision: ${JSON.stringify(neighbourRows)}`);

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
        pendingTraceRead,
        nonMedicalTraceRead,
        admission,
        neighbourRows,
      })}`,
    );
    say(
      "RESULT: PASS — a doctor of another organization neither reads nor writes clinic A's refusal",
    );
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
    say(`ROLLBACK_FACTS: ${JSON.stringify({ fixtureRows: residual.rows[0].rows })}`);
    await client.end();
  }
}

main();
