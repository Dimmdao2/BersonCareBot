/**
 * Э4c: живое доказательство на именованной DEV внутри одной транзакции с ROLLBACK.
 * Проверяет конечные данные решения, а не текст миграции: комментарий, обе стороны следа,
 * pending-набор четырёх индикаторов и условную постановку обращения платформенным администраторам.
 */
import {
  clearDoctorContext,
  clinicsWithDoctors,
  connect,
  faultFromEnv,
  installCandidate,
  installCandidateNamedRootCapability,
  installDoctorNamedRootContext,
} from './doctor-medical-merge-door.proofHarness.mjs';

const TARGET = '00000000-0000-4000-8000-00000000a4c1';
const DUPLICATE = '00000000-0000-4000-8000-00000000a4c2';
const REFUSAL_LOCAL = '00000000-0000-4000-8000-00000000a4d1';
const REFUSAL_SUPPORT = '00000000-0000-4000-8000-00000000a4d2';
const LOCAL_COMMENT = 'Это разные люди; обращение в поддержку не требуется';
const SUPPORT_COMMENT = 'Это разные люди; нужен разбор техподдержки';

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

async function main() {
  const { client, db, who } = await connect();
  say(`connected: db=${db} as=${who}`);
  await client.query('BEGIN');
  try {
    await installCandidate(client, FAULT, say);
    const [clinic] = await clinicsWithDoctors(client, 1, say);

    for (const [id, name, kind, value] of [
      [TARGET, 'Э4c учётка один', 'email', 'one@example.test'],
      [DUPLICATE, 'Э4c учётка два', 'phone', '+79990000002'],
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
    }

    await client.query(
      `INSERT INTO public.patient_merge_candidates(
         id, organization_id, anchor_user_id, candidate_user_id, reason, status, payload
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'medical_history:email_bind', 'pending',
         jsonb_build_object(
           'humanFioDecision', jsonb_build_object(
             'prompt', jsonb_build_object('foundAccountId', $4::text)
           )
         )
       )`,
      [REFUSAL_LOCAL, clinic.org_id, TARGET, DUPLICATE],
    );
    if (!(await refuse(client, clinic, REFUSAL_LOCAL, LOCAL_COMMENT, false))) {
      throw new Error('local refusal was not recorded');
    }

    const local = await client.query(
      `SELECT status, doctor_comment, support_requested,
              (SELECT count(*)::int FROM public.admin_audit_log
                WHERE conflict_key LIKE 'doctor-refused-medical-merge:%'
                  AND details->>'conflictId' = $1::text) AS support_rows,
              (SELECT count(*)::int FROM public.patient_merge_candidates
                WHERE id = $1::uuid AND status = 'pending') AS pending_rows,
              (SELECT count(*)::int FROM public.patient_merge_candidates
                WHERE id = $1::uuid AND (anchor_user_id = $2::uuid OR candidate_user_id = $2::uuid)) AS target_marks,
              (SELECT count(*)::int FROM public.patient_merge_candidates
                WHERE id = $1::uuid AND (anchor_user_id = $3::uuid OR candidate_user_id = $3::uuid)) AS duplicate_marks
         FROM public.patient_merge_candidates WHERE id = $1::uuid`,
      [REFUSAL_LOCAL, TARGET, DUPLICATE],
    );
    const localRow = local.rows[0];
    say(`local refusal: ${JSON.stringify(localRow)}`);
    if (
      localRow.status !== 'dismissed' ||
      localRow.doctor_comment !== LOCAL_COMMENT ||
      localRow.support_requested !== false ||
      localRow.support_rows !== 0 ||
      localRow.pending_rows !== 0 ||
      localRow.target_marks !== 1 ||
      localRow.duplicate_marks !== 1
    ) {
      throw new Error(`local refusal has the wrong observable state: ${JSON.stringify(localRow)}`);
    }

    await openNamedRoot(
      client,
      clinic,
      'app.read_staff_patient_medical_merge_refusal(uuid)',
      [REFUSAL_LOCAL],
    );
    const detail = await client.query(
      `SELECT app.read_staff_patient_medical_merge_refusal($1::uuid) AS snapshot`,
      [REFUSAL_LOCAL],
    );
    await clearDoctorContext(client);
    const snapshot = detail.rows[0]?.snapshot;
    say(`refusal details: ${JSON.stringify(snapshot)}`);
    const contactValues = snapshot?.parties?.flatMap((party) =>
      party.contacts.map((contact) => contact.value),
    );
    if (
      snapshot?.doctorComment !== LOCAL_COMMENT ||
      snapshot?.parties?.length !== 2 ||
      !contactValues?.includes('one@example.test') ||
      !contactValues?.includes('+79990000002') ||
      snapshot?.resolvedBy?.userId !== clinic.staff_id ||
      snapshot?.initiatedBy?.userId !== TARGET
    ) {
      throw new Error('refusal details lost an account, contact, initiator, resolver, or comment');
    }

    await client.query(
      `INSERT INTO public.patient_merge_candidates(
         id, organization_id, anchor_user_id, candidate_user_id, reason, status
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'medical_history:phone_bind', 'pending')`,
      [REFUSAL_SUPPORT, clinic.org_id, TARGET, DUPLICATE],
    );
    if (!(await refuse(client, clinic, REFUSAL_SUPPORT, SUPPORT_COMMENT, true))) {
      throw new Error('support refusal was not recorded');
    }
    const support = await client.query(
      `SELECT candidate.status, candidate.doctor_comment, candidate.support_requested,
              count(audit.id)::int AS support_rows
         FROM public.patient_merge_candidates candidate
         LEFT JOIN public.admin_audit_log audit
           ON audit.details->>'conflictId' = candidate.id::text
        WHERE candidate.id = $1::uuid
        GROUP BY candidate.id`,
      [REFUSAL_SUPPORT],
    );
    say(`support refusal: ${JSON.stringify(support.rows[0])}`);
    if (
      support.rows[0]?.status !== 'escalated' ||
      support.rows[0]?.doctor_comment !== SUPPORT_COMMENT ||
      support.rows[0]?.support_requested !== true ||
      support.rows[0]?.support_rows !== 1
    ) {
      throw new Error('support refusal did not create exactly one platform request');
    }

    say('RESULT: PASS — both accounts keep the refusal trace; support follows the explicit answer; pending indicators are empty');
  } catch (error) {
    say(`RESULT: FAIL — ${error.code ? `${error.code} ` : ''}${error.message}`);
    process.exitCode = 1;
  } finally {
    await client.query('ROLLBACK');
    const residual = await client.query(
      `SELECT count(*)::int AS rows FROM public.platform_users WHERE id IN ($1::uuid, $2::uuid)`,
      [TARGET, DUPLICATE],
    );
    say(`rolled back; fixture rows left in the database: ${residual.rows[0].rows}`);
    await client.end();
  }
}

main();
