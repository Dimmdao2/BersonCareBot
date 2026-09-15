/**
 * Живое доказательство §18а на врачебном пути: человек выбрал, какое ФИО оставить, ПОТОМ сработал
 * медицинский блокер §18, и только после одобрения врача учётки слились. Подпись обязана остаться
 * той, которую выбрал ЧЕЛОВЕК, а не той, которую до диалога выбрал движок.
 *
 * Уже случившийся отказ, который прогон ловит (F1 независимого аудита 15.09): гейт §18 бросал блокер
 * РАНЬШЕ записи ФИО, транзакция слияния откатывалась вместе с ответом человека, а строка конфликта
 * его не хранила. После «Слить» врача пара сливалась с подписью целевой учётки — молча, без единого
 * предупреждения человеку, который минуту назад ответил на прямой вопрос об имени. Дорого и тихо:
 * дальше под этим ФИО живёт вся карточка.
 *
 * Два сценария, оба в одной транзакции с `ROLLBACK`:
 *  1. ответ человека сохранён → врач жмёт «Слить» → в `platform_users` и `user_identity` выбранное им;
 *  2. ответа нет, а ФИО расходится → дверь НЕ сливает и отвечает `fio_decision_required`.
 *
 * Оракул независим от нашего кода: он в каноне (§18а «просим человека выбрать правильный вариант»),
 * а измеряется живым PostgreSQL — что лежит в строке после слияния.
 *
 * Запускается не напрямую, а из `doctor-medical-merge-door.devDbProof.test.mjs`.
 */
import {
  createHumanMergeDecision,
  createHumanMergePrompt,
  mergePlatformUsersInTransaction,
  parseStoredHumanMergeDecision,
} from '@bersoncare/platform-merge';
import {
  clearPortContext,
  clinicsWithDoctors,
  connect,
  faultFromEnv,
  installCandidate,
  installCandidateNamedRootCapability,
  installDoctorContext,
  installPreSessionNamedRootContext,
  staffCapability,
} from './doctor-medical-merge-door.proofHarness.mjs';

const RECORD_DOOR = 'app.record_patient_medical_merge_conflict(uuid,uuid,uuid,text,text)';

/** Пара «ответ сохранён» и пара «ответа нет» — разные учётки, чтобы сценарии не мешали друг другу. */
const KEPT = {
  target: '00000000-0000-4000-8000-00000000f2a1',
  duplicate: '00000000-0000-4000-8000-00000000f2a2',
};
const LOST = {
  target: '00000000-0000-4000-8000-00000000f2b1',
  duplicate: '00000000-0000-4000-8000-00000000f2b2',
};
const ALL_IDS = [KEPT.target, KEPT.duplicate, LOST.target, LOST.duplicate];

const FAULT = faultFromEnv();
function say(line) {
  process.stdout.write(`${line}\n`);
}

/** Строка `platform_users` ровно в тех полях, из которых собирается диалог §18а. */
async function loadSummary(client, id) {
  const row = await client.query(
    `SELECT id::text, display_name, first_name, last_name, patronymic, created_at
       FROM public.platform_users WHERE id = $1::uuid`,
    [id],
  );
  const found = row.rows[0];
  return {
    id: found.id,
    displayName: found.display_name,
    firstName: found.first_name,
    lastName: found.last_name,
    patronymic: found.patronymic,
    createdAt: found.created_at,
  };
}

async function insertPair(client, clinic, pair, names) {
  for (const [id, fio] of [
    [pair.target, names.target],
    [pair.duplicate, names.duplicate],
  ]) {
    await client.query(
      `INSERT INTO public.platform_users(id, display_name, first_name, last_name, role)
       VALUES ($1::uuid, $2, $3, $4, 'client')`,
      [id, `${fio.lastName} ${fio.firstName}`, fio.firstName, fio.lastName],
    );
    await client.query(
      `INSERT INTO public.org_enrollments(organization_id, platform_user_id, status)
       VALUES ($1::uuid, $2::uuid, 'active')`,
      [clinic.org_id, id],
    );
    // Квалифицирующая медицинская история С ОБЕИХ сторон в ОДНОЙ клинике — настоящий блокер §18.
    await client.query(
      `INSERT INTO public.clinical_visit(patient_user_id, visit_type, visited_at, created_by, organization_id)
       VALUES ($1::uuid, 'first', now(), $2::uuid, $3::uuid)`,
      [id, clinic.staff_id, clinic.org_id],
    );
    await client.query(
      `INSERT INTO public.user_password_credentials(user_id, password_hash) VALUES ($1::uuid, 'argon2-f2-proof')`,
      [id],
    );
  }
}

/** Шаг человека: он подтвердил найденную учётку и выбрал фамилию дубликата. */
async function answerFioQuestion(client, pair) {
  const target = await loadSummary(client, pair.target);
  const duplicate = await loadSummary(client, pair.duplicate);
  const prompt = createHumanMergePrompt(target, duplicate, pair.duplicate);
  if (prompt.conflicts.join(',') !== 'last_name') {
    throw new Error(`fixture is not a last-name conflict: ${JSON.stringify(prompt.conflicts)}`);
  }
  return createHumanMergeDecision(prompt, { last_name: { source: 'duplicate' } });
}

/** Настоящая автоматическая дверь: ответ человека есть, а медицинский блокер её отменяет. */
async function deferredByMedicalBlocker(client, pair, decision) {
  await client.query('SAVEPOINT auto_attempt');
  try {
    await mergePlatformUsersInTransaction(client, pair.target, pair.duplicate, 'phone_bind', {
      humanDecision: decision,
      mergeContext: { source: 'otp' },
    });
    throw new Error('automatic merge unexpectedly succeeded: the medical blocker did not fire');
  } catch (err) {
    if (err.code !== 'MergeDependentConflictError' || err.kind !== 'medical_history') throw err;
    await client.query('ROLLBACK TO SAVEPOINT auto_attempt');
    return err;
  }
}

/** Настоящая дверь записи конфликта, под рантайм-ролью bootstrap-принципала webapp. */
async function recordConflict(client, capability, clinic, pair, blocker) {
  const serialized = blocker.humanFioDecision ? JSON.stringify(blocker.humanFioDecision) : null;
  await installPreSessionNamedRootContext(client, capability, [
    { type: 'uuid', value: clinic.org_id },
    { type: 'uuid', value: pair.target },
    { type: 'uuid', value: pair.duplicate },
    { type: 'text', value: 'phone_bind' },
    { type: 'text', value: serialized },
  ]);
  const recorded = await client.query(
    `SELECT app.record_patient_medical_merge_conflict($1::uuid, $2::uuid, $3::uuid, $4::text, $5::text)::text AS conflict_id`,
    [clinic.org_id, pair.target, pair.duplicate, 'phone_bind', serialized],
  );
  await clearPortContext(client);
  return recorded.rows[0].conflict_id;
}

/** Нажатие врачом «Слить» — ровно то, что делает `mergeMedicalConflict` репозитория. */
async function doctorPressesMerge(client, capability, clinic, pair, conflictId) {
  const stored = await client.query(
    `SELECT payload FROM public.patient_merge_candidates WHERE id = $1::uuid`,
    [conflictId],
  );
  const decision = parseStoredHumanMergeDecision(stored.rows[0]?.payload?.humanFioDecision);
  say(`conflict ${conflictId}: stored human FIO answer = ${decision ? 'yes' : 'NO'}`);
  await installDoctorContext(client, capability, clinic);
  const result = await mergePlatformUsersInTransaction(
    client,
    pair.target,
    pair.duplicate,
    'phone_bind',
    {
      medicalConflictApproval: {
        conflictId,
        organizationId: clinic.org_id,
        actorId: clinic.staff_id,
      },
      humanDecision: decision ?? undefined,
      mergeContext: { actorId: clinic.staff_id, source: 'doctor_medical_conflict_review' },
    },
  );
  await clearPortContext(client);
  return result;
}

async function fioAfter(client, pair) {
  const row = await client.query(
    `SELECT (SELECT last_name FROM public.platform_users WHERE id = $1::uuid) AS users_last_name,
            (SELECT display_name FROM public.platform_users WHERE id = $1::uuid) AS users_display_name,
            (SELECT last_name FROM public.user_identity WHERE platform_user_id = $1::uuid) AS identity_last_name,
            (SELECT merged_into_id::text FROM public.platform_users WHERE id = $2::uuid) AS duplicate_merged_into`,
    [pair.target, pair.duplicate],
  );
  return row.rows[0];
}

async function main() {
  const { client, db, who } = await connect();
  say(`connected: db=${db} as=${who}`);

  await client.query('BEGIN');
  try {
    await installCandidate(client, FAULT, say);

    const staff = await staffCapability(client);
    const [clinic] = await clinicsWithDoctors(client, 1, say);
    // Дверь записи конфликта открывает bootstrap-принципал, то есть КЛАСС `pre_session`, а не пациент.
    const recordCapability = await installCandidateNamedRootCapability(
      client,
      RECORD_DOOR,
      'app_pre_session',
    );
    say(`fixture clinic=${clinic.org_id} doctor=${clinic.staff_id}`);

    // «Иванов» — целевая учётка, «Сидоров» — найденная; человек выбирает «Сидоров».
    const names = {
      target: { lastName: 'Иванов', firstName: 'Пётр' },
      duplicate: { lastName: 'Сидоров', firstName: 'Пётр' },
    };
    await insertPair(client, clinic, KEPT, names);
    await insertPair(client, clinic, LOST, names);
    say('fixture inserted (2 pairs, conflicting last names, medical history on both sides)');

    // --- сценарий 1: ответ человека сохранён и применён ---
    const decision = await answerFioQuestion(client, KEPT);
    const blocker = await deferredByMedicalBlocker(client, KEPT, decision);
    say(
      `automatic merge deferred by the medical blocker; answer carried out with it: ${
        blocker.humanFioDecision ? 'yes' : 'NO'
      }`,
    );
    const keptConflict = await recordConflict(client, recordCapability, clinic, KEPT, blocker);
    const keptOutcome = await doctorPressesMerge(client, staff, clinic, KEPT, keptConflict);
    say(`doctor merge returned: ${JSON.stringify(keptOutcome)}`);
    const kept = await fioAfter(client, KEPT);
    say(`FIO after the doctor merged: ${JSON.stringify(kept)}`);

    // --- сценарий 2: ответа человека нет, а ФИО расходится ---
    const lostConflict = await recordConflict(client, recordCapability, clinic, LOST, {
      humanFioDecision: null,
    });
    const lostOutcome = await doctorPressesMerge(client, staff, clinic, LOST, lostConflict);
    say(`doctor merge WITHOUT a stored answer returned: ${JSON.stringify(lostOutcome)}`);
    const lost = await fioAfter(client, LOST);
    say(`state after the refused merge: ${JSON.stringify(lost)}`);

    const failures = [];
    if (keptOutcome.mergeOutcome !== 'merged') {
      failures.push(`scenario 1: expected merged, got ${keptOutcome.mergeOutcome}`);
    }
    if (kept.users_last_name !== 'Сидоров') {
      failures.push(`scenario 1: platform_users.last_name is '${kept.users_last_name}', not the chosen 'Сидоров'`);
    }
    if (kept.identity_last_name !== 'Сидоров') {
      failures.push(`scenario 1: user_identity.last_name is '${kept.identity_last_name}', not the chosen 'Сидоров'`);
    }
    if (kept.duplicate_merged_into !== KEPT.target) {
      failures.push('scenario 1: the duplicate was not actually merged into the target');
    }
    if (lostOutcome.mergeOutcome !== 'fio_decision_required') {
      failures.push(`scenario 2: expected fio_decision_required, got ${lostOutcome.mergeOutcome}`);
    }
    if (lost.duplicate_merged_into !== null) {
      failures.push('scenario 2: accounts were merged although nobody chose the surname');
    }

    if (failures.length > 0) {
      for (const failure of failures) say(`  ! ${failure}`);
      say("RESULT: FAIL — the person's FIO answer does not survive the doctor door");
      process.exitCode = 1;
    } else {
      say("RESULT: PASS — the person's chosen surname survived the medical defer and the doctor merge");
    }
  } catch (err) {
    say(`RESULT: FAIL — ${err.code ? `${err.code} ` : ''}${err.message}`);
    if (err.where) say(`  where: ${String(err.where)}`);
    if (err.detail) say(`  detail: ${err.detail}`);
    if (err.hint) say(`  hint: ${err.hint}`);
    process.exitCode = 1;
  } finally {
    await client.query('ROLLBACK');
    const check = await client.query(
      `SELECT count(*)::int AS leftovers FROM public.platform_users WHERE id = ANY($1::uuid[])`,
      [ALL_IDS],
    );
    say(`rolled back; fixture rows left in the database: ${check.rows[0].leftovers}`);
    await client.end();
  }
}

main();
