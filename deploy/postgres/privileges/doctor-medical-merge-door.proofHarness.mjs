/**
 * Общая оснастка живых доказательств двери «врач разбирает медицинский конфликт слияния».
 *
 * Кандидатная миграция ветки и кандидатные права ставятся ВНУТРИ транзакции, которая всегда
 * заканчивается `ROLLBACK`: миграция ветки на DEV по-настоящему не применяется, ledger миграций не
 * трогается, постоянных строк не остаётся. Тела-доказательства (`*.proofBody.mjs`) отличаются только
 * фикстурой и утверждениями, поэтому установка кандидата, роль врача и порт-контекст живут здесь.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

export const DB = 'bcb_webapp_dev';
export const SEAM = 'app_seam_identity_lookup_owner';

const REPO = process.env.BCB_PROOF_REPO;
/**
 * Кандидатные миграции двери — В ПОРЯДКЕ ИМЁН, как их применяет мигратор. Вторая переписывает
 * `app.record_patient_medical_merge_conflict`, поэтому применить только первую значит мерить
 * позавчерашнюю дверь и не заметить ни одного отказа, который чинит вторая.
 */
/** Метка склейки файлов: по ней блоки соотносятся со своей миграцией. */
const MIGRATION_FILE_BOUNDARY = '-- BCB-PROOF-MIGRATION-BOUNDARY';
const MIGRATIONS = [
  'apps/webapp/db/drizzle-migrations/20260914T220000_doctor_resolves_medical_merge_conflict.sql',
  'apps/webapp/db/drizzle-migrations/20260915T102455_doctor_merge_decision_has_a_record.sql',
  'apps/webapp/db/drizzle-migrations/20260915T150000_the_person_fio_answer_survives_the_doctor_defer.sql',
].map((relative) => path.join(REPO ?? '', relative));
const PRIVILEGES = path.join(REPO ?? '', 'deploy/postgres/generated', `privileges.${DB}.sql`);

/** Слепые поломки: каждая возвращает поверхность к тому состоянию, ради которого фикс и делался. */
export const FAULTS = new Set([
  '',
  'privilege',
  'two-clinic-blindness',
  'staff-insert',
  'foreign-org-conflict',
  'fio-decision-not-persisted',
  'support-always-escalates',
  'decision-stays-pending',
  'comment-not-saved',
  'approval-comment-not-saved',
  'refusal-read-any-org',
  'refusal-write-any-org',
  'refusal-read-any-status',
  'refusal-read-any-reason',
  'approval-comment-foreign-row',
  'approval-comment-optional',
  'refusal-comment-optional',
  'refusal-write-any-row',
  'refusal-write-any-status',
  'refusal-write-any-reason',
  'approval-any-status',
  'approval-any-reason',
  'approval-write-any-row',
  'approval-write-any-pair',
  'refusal-read-any-row',
  'neighbour-approval-any-org',
  'neighbour-approval-any-status',
  'neighbour-approval-any-reason',
  'neighbour-approval-not-required',
  'neighbour-approval-any-pair',
]);

export function faultFromEnv() {
  const fault = process.env.BCB_PROOF_FAULT ?? '';
  if (!FAULTS.has(fault)) throw new Error(`unknown BCB_PROOF_FAULT '${fault}'`);
  return fault;
}

/**
 * Поломка обязана доехать ровно в ту дверь, ради которой написана. Тексты предикатов в трёх
 * миграциях повторяются дословно, а `String.replace` меняет ТОЛЬКО ПЕРВОЕ вхождение — так инжектор
 * молча уезжает в соседнюю функцию, прогон остаётся зелёным и выдаёт себя за доказательство.
 * Поэтому каждая замена проверяет, что якорь в склеенном источнике РОВНО один.
 */
function markFaultInjected(fault) {
  process.stdout.write(`FAULT INJECTED: ${fault}\n`);
}

function replaceOnce(source, marker, replacement, fault) {
  const count = source.split(marker).length - 1;
  if (count !== 1) {
    throw new Error(
      `fault ${fault}: marker matched ${count} times, expected exactly 1 — уточни якорь`,
    );
  }
  const replaced = source.replace(marker, replacement);
  markFaultInjected(fault);
  return replaced;
}

function migrationSource(fault) {
  let source = MIGRATIONS.map((file) => fs.readFileSync(file, 'utf8')).join(
    `\n${MIGRATION_FILE_BOUNDARY}\n--> statement-breakpoint\n`,
  );
  if (fault === 'fio-decision-not-persisted') {
    // Дверь записи конфликта перестаёт класть ответ человека про ФИО в строку конфликта — ровно то
    // состояние, из-за которого после одобрения врача выживала подпись, выбранная движком (§18а).
    const marker =
      "|| pg_catalog.jsonb_build_object('humanFioDecision', p_human_fio_decision::jsonb)";
    source = replaceOnce(source, marker, "|| '{}'::jsonb", fault);
  }
  if (fault === 'two-clinic-blindness') {
    // Дверь перестаёт видеть блокер ЧУЖОЙ клиники — ровно то, что чинит Д1. Прогон, который после
    // этого остаётся зелёным, про «второй клинике решать самой» ничего не доказывает.
    const marker = 'WHERE target_history.organization_id IS DISTINCT FROM v_organization_id';
    source = replaceOnce(source, marker, 'WHERE false', fault);
  }
  if (fault === 'foreign-org-conflict') {
    // Дверь перестаёт сверять, ЧЬЕЙ организации конфликт — ровно то, что держит §18б («разбирает
    // врач своей организации»). Прогон, который после этого остаётся зелёным, про принадлежность
    // конфликта ничего не доказывает.
    // The active path has two overloads: the latest five-argument wrapper validates the row, then
    // calls the four-argument transfer door, which validates it again. The fault means the tenant
    // wall is absent, so both live predicates must be removed; mutating either one alone leaves the
    // other wall standing and makes the injector ineffective.
    const markers = [
      'AND candidate.organization_id = app.current_org_id()',
      'AND candidate.organization_id = v_organization_id',
    ];
    for (const marker of markers) {
      source = replaceOnce(source, marker, 'AND TRUE', fault);
    }
  }
  if (fault === 'support-always-escalates') {
    const marker = 'IF p_support_requested THEN\n    INSERT INTO public.admin_audit_log';
    source = replaceOnce(
      source,
      marker,
      'IF TRUE THEN\n    INSERT INTO public.admin_audit_log',
      fault,
      fault,
    );
  }
  if (fault === 'decision-stays-pending') {
    const marker =
      "IF v_outcome = 'awaiting_other_organization' THEN\n    UPDATE public.patient_merge_candidates\n       SET status = 'resolved', resolved_at = pg_catalog.now(), resolved_by = p_actor_id";
    source = replaceOnce(
      source,
      marker,
      "IF v_outcome = 'awaiting_other_organization' THEN\n    UPDATE public.patient_merge_candidates\n       SET resolved_at = pg_catalog.now(), resolved_by = p_actor_id",
      fault,
    );
  }
  if (fault === 'comment-not-saved') {
    const marker =
      'doctor_comment = pg_catalog.btrim(p_doctor_comment),\n         support_requested = p_support_requested';
    source = replaceOnce(
      source,
      marker,
      'doctor_comment = NULL,\n         support_requested = p_support_requested',
      fault,
    );
  }
  if (fault === 'refusal-read-any-org') {
    // Дверь чтения следа отказа перестаёт сверять организацию конфликта, а §18б держит разбор за
    // врачом СВОЕЙ клиники. Прогон, зелёный после этого, про стену чтения не говорит ничего.
    const marker =
      "AND c.organization_id = app.current_org_id()\n         AND c.status IN ('dismissed', 'escalated')";
    source = replaceOnce(
      source,
      marker,
      "AND TRUE\n         AND c.status IN ('dismissed', 'escalated')",
      fault,
    );
  }
  if (fault === 'refusal-write-any-org') {
    // Дверь записи отказа перестаёт сверять организацию конфликта. Приложение здесь не
    // подстраховывает: маршрут отдаёт в дверь `conflictId` из URL без единой сверки организации.
    const marker =
      'support_requested = p_support_requested\n   WHERE id = p_conflict_id\n     AND organization_id = app.current_org_id()';
    source = replaceOnce(
      source,
      marker,
      'support_requested = p_support_requested\n   WHERE id = p_conflict_id\n     AND TRUE',
      fault,
    );
  }
  if (fault === 'approval-comment-not-saved') {
    const marker =
      'UPDATE public.patient_merge_candidates candidate\n     SET doctor_comment = pg_catalog.btrim(p_doctor_comment)';
    source = replaceOnce(
      source,
      marker,
      'UPDATE public.patient_merge_candidates candidate\n     SET doctor_comment = NULL',
      fault,
    );
  }
  if (fault === 'refusal-read-any-status') {
    // Дверь чтения следа отказа перестаёт требовать, чтобы решение врача УЖЕ состоялось, и отдаёт
    // снимок по ещё не разобранному `pending`. По Э4c след появляется ПОСЛЕ решения врача.
    const marker =
      "AND c.status IN ('dismissed', 'escalated')\n         AND c.reason LIKE 'medical_history:%'";
    source = replaceOnce(
      source,
      marker,
      "AND TRUE\n         AND c.reason LIKE 'medical_history:%'",
      fault,
      fault,
    );
  }
  if (fault === 'refusal-read-any-reason') {
    // Дверь перестаёт отличать МЕДИЦИНСКИЙ конфликт от любого другого кандидата слияния и отдаёт
    // чужой по смыслу разбор как медицинский след. Э4c живёт внутри §18б — медицинских данных.
    // Якорь обязан включать строку статуса: без неё тот же текст стоит ещё и в СОСЕДНЕЙ двери
    // чтения pending-конфликта, а `String.replace` меняет только ПЕРВОЕ вхождение — поломка уехала
    // бы не в ту дверь и осталась бы незамеченной (ровно так этот инжектор и родился зелёным).
    const marker =
      "AND c.status IN ('dismissed', 'escalated')\n" +
      "         AND c.reason LIKE 'medical_history:%'\n" +
      '       LIMIT 1';
    source = replaceOnce(
      source,
      marker,
      "AND c.status IN ('dismissed', 'escalated')\n         AND TRUE\n       LIMIT 1",
      fault,
      fault,
    );
  }
  if (fault === 'refusal-read-any-row') {
    // Известный врачу UUID не даёт права получить след ДРУГОГО конфликта той же клиники.
    const marker =
      '       WHERE c.id = p_conflict_id\n' +
      '         AND c.organization_id = app.current_org_id()\n' +
      "         AND c.status IN ('dismissed', 'escalated')";
    source = replaceOnce(
      source,
      marker,
      '       WHERE c.id <> p_conflict_id\n' +
        '         AND c.organization_id = app.current_org_id()\n' +
        "         AND c.status IN ('dismissed', 'escalated')",
      fault,
    );
  }
  if (fault === 'approval-comment-foreign-row') {
    // Пятиаргументная дверь подтверждения перестаёт сверять организацию ИМЕННО в записи
    // комментария, оставляя стену четырёхаргументной двери на месте. Слияние по-прежнему
    // отказывает (`conflict_not_found`), но комментарий врача чужой клиники УЖЕ лёг в строку
    // соседа — отличие от `foreign-org-conflict`, который сносит обе стены сразу.
    const marker =
      'UPDATE public.patient_merge_candidates candidate\n' +
      '     SET doctor_comment = pg_catalog.btrim(p_doctor_comment)\n' +
      '   WHERE candidate.id = p_conflict_id\n' +
      '     AND candidate.organization_id = app.current_org_id()';
    source = replaceOnce(
      source,
      marker,
      'UPDATE public.patient_merge_candidates candidate\n' +
        '     SET doctor_comment = pg_catalog.btrim(p_doctor_comment)\n' +
        '   WHERE candidate.id = p_conflict_id\n' +
        '     AND TRUE',
      fault,
    );
  }
  if (fault === 'approval-comment-optional') {
    // Дверь ПОДТВЕРЖДЕНИЯ перестаёт требовать комментарий врача. План владельца: «Принять открывает
    // дополнительное подтверждение с комментарием врача» — без обязательности решение остаётся без
    // объяснения, а слияние всё равно происходит.
    const marker =
      '  v_outcome text;\nBEGIN\n' +
      "  IF pg_catalog.btrim(COALESCE(p_doctor_comment, '')) = '' OR\n" +
      '     pg_catalog.length(pg_catalog.btrim(p_doctor_comment)) > 2000 THEN';
    source = replaceOnce(source, marker, '  v_outcome text;\nBEGIN\n  IF FALSE THEN', fault);
  }
  if (fault === 'refusal-comment-optional') {
    // То же у двери ОТКАЗА: след отказа обязан нести объяснение врача, иначе пометка в обеих учётках
    // ничего не сообщает ни второй клинике, ни платформе.
    const marker =
      "    'app.refuse_staff_patient_medical_merge_conflict(uuid,uuid,text,boolean)'::regprocedure\n" +
      '  );\n\n' +
      "  IF pg_catalog.btrim(COALESCE(p_doctor_comment, '')) = '' OR\n" +
      '     pg_catalog.length(pg_catalog.btrim(p_doctor_comment)) > 2000 THEN';
    source = replaceOnce(
      source,
      marker,
      "    'app.refuse_staff_patient_medical_merge_conflict(uuid,uuid,text,boolean)'::regprocedure\n" +
        '  );\n\n  IF FALSE THEN',
      fault,
    );
  }
  if (
    fault === 'refusal-write-any-row' ||
    fault === 'refusal-write-any-status' ||
    fault === 'refusal-write-any-reason'
  ) {
    // Выбор строки в двери отказа: какой конфликт, в каком состоянии и про какие данные. Снятие
    // любого из трёх означает, что врач закрывает своим комментарием не тот разбор.
    // Якорь начинается со строки `support_requested`: тот же WHERE-блок стоит и в ПРЕЖНЕЙ редакции
    // двери из первой миграции, а колонка признака поддержки есть только в нынешней.
    const marker =
      '         support_requested = p_support_requested\n' +
      '   WHERE id = p_conflict_id\n' +
      '     AND organization_id = app.current_org_id()\n' +
      "     AND status = 'pending'\n" +
      "     AND reason LIKE 'medical_history:%'\n" +
      '  RETURNING id, organization_id';
    const replacement = marker
      .replace(
        'WHERE id = p_conflict_id',
        fault === 'refusal-write-any-row'
          ? 'WHERE id <> p_conflict_id'
          : 'WHERE id = p_conflict_id',
      )
      .replace(
        "AND status = 'pending'",
        fault === 'refusal-write-any-status' ? 'AND TRUE' : "AND status = 'pending'",
      )
      .replace(
        "AND reason LIKE 'medical_history:%'",
        fault === 'refusal-write-any-reason' ? 'AND TRUE' : "AND reason LIKE 'medical_history:%'",
      );
    source = replaceOnce(source, marker, replacement, fault);
  }
  if (
    fault === 'approval-any-status' ||
    fault === 'approval-any-reason' ||
    fault === 'approval-write-any-row' ||
    fault === 'approval-write-any-pair'
  ) {
    // Тот же выбор строки у двери подтверждения: уже разобранный конфликт и немедицинский кандидат
    // не должны проходить через медицинскую дверь второй раз.
    const marker =
      '   WHERE candidate.id = p_conflict_id\n' +
      '     AND candidate.organization_id = app.current_org_id()\n' +
      "     AND candidate.status = 'pending'\n" +
      "     AND candidate.reason LIKE 'medical_history:%'\n" +
      '     AND LEAST(candidate.anchor_user_id::text, candidate.candidate_user_id::text) =\n' +
      '         LEAST(p_target_user_id::text, p_duplicate_user_id::text)\n' +
      '     AND GREATEST(candidate.anchor_user_id::text, candidate.candidate_user_id::text) =\n' +
      '         GREATEST(p_target_user_id::text, p_duplicate_user_id::text)';
    const replacement = marker
      .replace(
        'WHERE candidate.id = p_conflict_id',
        fault === 'approval-write-any-row'
          ? 'WHERE candidate.id <> p_conflict_id'
          : 'WHERE candidate.id = p_conflict_id',
      )
      .replace(
        "AND candidate.status = 'pending'",
        fault === 'approval-any-status' ? 'AND TRUE' : "AND candidate.status = 'pending'",
      )
      .replace(
        "AND candidate.reason LIKE 'medical_history:%'",
        fault === 'approval-any-reason'
          ? 'AND TRUE'
          : "AND candidate.reason LIKE 'medical_history:%'",
      )
      .replace(
        'AND LEAST(candidate.anchor_user_id::text, candidate.candidate_user_id::text) =\n' +
          '         LEAST(p_target_user_id::text, p_duplicate_user_id::text)\n' +
          '     AND GREATEST(candidate.anchor_user_id::text, candidate.candidate_user_id::text) =\n' +
          '         GREATEST(p_target_user_id::text, p_duplicate_user_id::text)',
        fault === 'approval-write-any-pair'
          ? 'AND TRUE\n     AND TRUE'
          : 'AND LEAST(candidate.anchor_user_id::text, candidate.candidate_user_id::text) =\n' +
              '         LEAST(p_target_user_id::text, p_duplicate_user_id::text)\n' +
              '     AND GREATEST(candidate.anchor_user_id::text, candidate.candidate_user_id::text) =\n' +
              '         GREATEST(p_target_user_id::text, p_duplicate_user_id::text)',
      );
    source = replaceOnce(source, marker, replacement, fault);
  }
  if (
    fault === 'neighbour-approval-any-org' ||
    fault === 'neighbour-approval-any-status' ||
    fault === 'neighbour-approval-any-reason' ||
    fault === 'neighbour-approval-not-required' ||
    fault === 'neighbour-approval-any-pair'
  ) {
    const marker =
      '          WHERE approved.organization_id IS NOT DISTINCT FROM target_history.organization_id\n' +
      "            AND approved.status IN ('pending', 'resolved')\n" +
      "            AND approved.reason LIKE 'medical_history:%'\n" +
      `            AND approved.payload @> '{"doctorApproved":true}'::jsonb\n` +
      '            AND LEAST(approved.anchor_user_id::text, approved.candidate_user_id::text) =\n' +
      '                LEAST(p_target_user_id::text, p_duplicate_user_id::text)\n' +
      '            AND GREATEST(approved.anchor_user_id::text, approved.candidate_user_id::text) =\n' +
      '                GREATEST(p_target_user_id::text, p_duplicate_user_id::text)';
    const replacement = marker
      .replace(
        'approved.organization_id IS NOT DISTINCT FROM target_history.organization_id',
        fault === 'neighbour-approval-any-org'
          ? 'TRUE'
          : 'approved.organization_id IS NOT DISTINCT FROM target_history.organization_id',
      )
      .replace(
        "approved.status IN ('pending', 'resolved')",
        fault === 'neighbour-approval-any-status'
          ? 'TRUE'
          : "approved.status IN ('pending', 'resolved')",
      )
      .replace(
        "approved.reason LIKE 'medical_history:%'",
        fault === 'neighbour-approval-any-reason'
          ? 'TRUE'
          : "approved.reason LIKE 'medical_history:%'",
      )
      .replace(
        `approved.payload @> '{"doctorApproved":true}'::jsonb`,
        fault === 'neighbour-approval-not-required'
          ? 'TRUE'
          : `approved.payload @> '{"doctorApproved":true}'::jsonb`,
      )
      .replace(
        'AND LEAST(approved.anchor_user_id::text, approved.candidate_user_id::text) =\n' +
          '                LEAST(p_target_user_id::text, p_duplicate_user_id::text)\n' +
          '            AND GREATEST(approved.anchor_user_id::text, approved.candidate_user_id::text) =\n' +
          '                GREATEST(p_target_user_id::text, p_duplicate_user_id::text)',
        fault === 'neighbour-approval-any-pair'
          ? 'AND TRUE\n            AND TRUE'
          : 'AND LEAST(approved.anchor_user_id::text, approved.candidate_user_id::text) =\n' +
              '                LEAST(p_target_user_id::text, p_duplicate_user_id::text)\n' +
              '            AND GREATEST(approved.anchor_user_id::text, approved.candidate_user_id::text) =\n' +
              '                GREATEST(p_target_user_id::text, p_duplicate_user_id::text)',
      );
    source = replaceOnce(source, marker, replacement, fault);
  }
  return source;
}

/**
 * Блоки кандидата в порядке применения. `migrationIndex` нужен вызывающему: часть миграций ветки уже
 * приземлена и накатана на DEV, и повторять их ОДНОРАЗОВЫЙ DDL в транзакции нельзя — индекс и
 * ограничение уже стоят. Тела `CREATE OR REPLACE FUNCTION` повторять и нужно, и безопасно: только так
 * в уже применённую дверь доезжает слепая поломка, ради которой прогон и существует.
 */
function migrationBlocks(fault) {
  let migrationIndex = 0;
  const blocks = [];
  for (const chunk of migrationSource(fault).split('--> statement-breakpoint')) {
    if (chunk.includes(MIGRATION_FILE_BOUNDARY)) migrationIndex += 1;
    const sql = chunk.replaceAll(MIGRATION_FILE_BOUNDARY, '');
    const owner = /--\s*BCB-MIGRATION-OWNER:\s*([a-z_0-9]+)/u.exec(sql)?.[1];
    if (!owner) throw new Error('migration block without an owner header');
    blocks.push({
      owner,
      sql,
      migrationIndex,
      replaceable: /CREATE OR REPLACE FUNCTION/u.test(sql),
    });
  }
  return blocks;
}

/** Теги миграций ветки, которые в живой DEV уже применены по ledger. */
async function appliedMigrationTags(client) {
  const rows = await client.query(
    `SELECT tag FROM drizzle.__drizzle_migrations WHERE tag = ANY($1::text[])`,
    [MIGRATIONS.map((file) => path.basename(file, '.sql'))],
  );
  return new Set(rows.rows.map((row) => row.tag));
}

async function alreadyGrantedPolicies(client) {
  const rows = await client.query(
    `SELECT pg_catalog.format('%I.%I', n.nspname, c.relname) || '|' || p.polname AS key
       FROM pg_catalog.pg_policy AS p
       JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
       JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE $1::regrole = ANY (p.polroles)`,
    [SEAM],
  );
  return new Set(rows.rows.map((row) => row.key));
}

function candidatePrivilegeStatements(installed) {
  const lines = fs.readFileSync(PRIVILEGES, 'utf8').split('\n');
  const out = [];
  const grantRe = new RegExp(`^GRANT .* TO "${SEAM}";$`, 'u');
  // Доверенность двери — строка `patient_merge_candidates`, поэтому права САМОЙ этой таблицы
  // переигрываются целиком: сначала REVOKE артефакта, затем его GRANT'ы, в порядке файла. Иначе
  // снятый в декларации колоночный INSERT роли врача до прогона не доезжает, и прогон проверяет
  // старое состояние базы вместо кандидатного.
  const doorTableRe =
    /^(GRANT|REVOKE) .* ON TABLE "public"\."patient_merge_candidates" (TO|FROM) /u;
  const newDoors =
    /^GRANT EXECUTE ON FUNCTION app\.(record_patient_medical_merge_conflict|transfer_staff_approved_platform_user_merge_data|read_staff_patient_medical_merge_conflict|read_staff_patient_medical_merge_refusal|refuse_staff_patient_medical_merge_conflict|resolve_platform_patient_medical_merge_conflicts)\(/u;
  // Фикстура «конфликт в двух клиниках» заводит вторую клинику (живая на DEV одна), а на INSERT в
  // `be_organizations` висит триггер `app.seed_reference_catalog_after_organization_insert()`. Его
  // `ON CONFLICT … DO NOTHING` требует SELECT по колонкам арбитра, которого у владельца шва на DEV
  // ещё нет: права реконсайлились с декларации, где объявлен был только INSERT. Кандидатный GRANT
  // доезжает сюда по тому же принципу, что и права двери, — иначе прогон меряет старое состояние
  // базы вместо кандидатного и краснеет на фикстуре, не дойдя до предмета проверки.
  const seedTriggerGrant =
    /^GRANT SELECT \(.*\) ON TABLE "public"\."system_settings" TO "app_seam_specialist_provision_owner";$/u;
  const policyRe = /^CREATE POLICY "([^"]+)" ON ("[^"]+"\."[^"]+")/u;
  for (const raw of lines) {
    const line = raw.trim();
    if (doorTableRe.test(line)) {
      out.push(line);
      continue;
    }
    if (grantRe.test(line) || newDoors.test(line) || seedTriggerGrant.test(line)) {
      out.push(line);
      continue;
    }
    if (line.startsWith('CREATE POLICY ') && line.includes(SEAM)) {
      const m = policyRe.exec(line);
      if (!m) throw new Error(`unparsed policy: ${line.slice(0, 80)}`);
      // Only move DEV forward where the candidate actually adds this seam owner to a wall.
      // Reinstalling every policy from the artifact would also drag in unrelated pending
      // declaration changes and break contexts this proof does not own.
      const key = `${m[2].replaceAll('"', '')}|${m[1]}`;
      if (installed.has(key)) continue;
      out.push(`DROP POLICY IF EXISTS "${m[1]}" ON ${m[2]};`);
      out.push(line);
    }
  }
  return out;
}

/**
 * Кандидатная миграция + кандидатные права внутри уже открытой транзакции. Возвращает строки для
 * журнала прогона: сколько блоков и сколько операторов прав реально применено.
 */
export async function installCandidate(client, fault, say) {
  await client.query(`GRANT CREATE ON SCHEMA app, app_ext TO ${SEAM}`);
  await client.query(`GRANT USAGE ON LANGUAGE plpgsql, sql TO ${SEAM}`);
  const applied = await appliedMigrationTags(client);
  const tags = MIGRATIONS.map((file) => path.basename(file, '.sql'));
  let executed = 0;
  let skipped = 0;
  for (const block of migrationBlocks(fault)) {
    // Уже применённую миграцию повторяем ТОЛЬКО телами функций: её одноразовый DDL в живой DEV уже
    // отработал, и второй `CREATE UNIQUE INDEX` просто уронил бы прогон на 42P07.
    if (applied.has(tags[block.migrationIndex]) && !block.replaceable) {
      skipped += 1;
      continue;
    }
    await client.query(`SET LOCAL ROLE ${block.owner}`);
    await client.query(block.sql);
    await client.query('RESET ROLE');
    executed += 1;
  }
  const pending = tags.filter((tag) => !applied.has(tag));
  say(
    `candidate migration applied: ${executed} owner-ordered blocks` +
      ` (${skipped} one-time blocks of already-applied migrations skipped;` +
      ` pending in DEV: ${pending.length > 0 ? pending.join(', ') : 'none'})`,
  );
  const privileges = candidatePrivilegeStatements(await alreadyGrantedPolicies(client));
  for (const statement of privileges) await client.query(statement);
  say(`candidate privileges applied: ${privileges.length} generated statements`);

  if (fault === 'privilege') {
    // Blind fault: take one declared table away from the door owner. A proof that stays green
    // here is not proving anything about privileges.
    await client.query(`REVOKE ALL ON TABLE public.user_password_credentials FROM ${SEAM}`);
    markFaultInjected(fault);
  }
  if (fault === 'staff-insert') {
    // Blind fault: вернуть самодельную доверенность — колоночный INSERT роли врача, снятый в Д2.
    await client.query(`GRANT INSERT ("anchor_user_id", "candidate_user_id", "created_at", "id",
      "organization_id", "payload", "reason", "resolved_at", "resolved_by", "status",
      "trigger_appointment_id") ON TABLE public.patient_merge_candidates TO app_staff`);
    markFaultInjected(fault);
  }
}

/** Возможность порт-контекста класса `staff` — та же, что открывает рантайм webapp. */
export async function staffCapability(client) {
  const rows = await client.query(`
    SELECT capability_id::text AS capability_id, session_login::text AS login,
           encode(app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'hex') AS args_hash
      FROM app_ext.port_context_capabilities
     WHERE context_class = 'staff' AND target_role = 'app_staff'
       AND purpose = 'relation' AND function_identity IS NULL
     ORDER BY session_login
     LIMIT 1`);
  const capability = rows.rows[0];
  if (!capability) throw new Error('DEV has no staff relation port-context capability');
  return capability;
}

/**
 * `count` РАЗНЫХ клиник, у каждой — активный сотрудник со ссылкой актора. Живых клиник на DEV
 * сегодня одна, а конфликт «в двух клиниках» без второй не показать, поэтому недостающие клиники
 * заводятся тут же, внутри той же транзакции с `ROLLBACK`, и об этом пишется в журнал прогона.
 */
export async function clinicsWithDoctors(client, count, say) {
  const real = await client.query(
    `WITH ranked AS (
       SELECT membership.platform_user_id, membership.organization_id, ref.opaque_ref,
              row_number() OVER (PARTITION BY membership.organization_id
                                 ORDER BY membership.platform_user_id) AS position
         FROM public.be_organization_members AS membership
         JOIN app_ext.variant_a_identity_refs AS ref
           ON ref.physical_user_id = membership.platform_user_id AND ref.ref_kind = 'actor'
        WHERE membership.status = 'active'
     )
     SELECT platform_user_id::text AS staff_id, organization_id::text AS org_id,
            opaque_ref::text AS actor_ref, false AS synthesized
       FROM ranked
      WHERE position = 1
      ORDER BY organization_id
      LIMIT $1`,
    [count],
  );
  const clinics = [...real.rows];
  for (let index = clinics.length; index < count; index += 1) {
    const suffix = `${index}`.padStart(3, '0');
    const orgId = `00000000-0000-4000-8000-0000000c1${suffix}`;
    const staffId = `00000000-0000-4000-8000-0000000c2${suffix}`;
    const actorRef = `00000000-0000-4000-8000-0000000c3${suffix}`;
    await client.query(`INSERT INTO public.be_organizations(id, title) VALUES ($1::uuid, $2)`, [
      orgId,
      `proof clinic ${suffix}`,
    ]);
    await client.query(
      `INSERT INTO public.platform_users(id, display_name, role) VALUES ($1::uuid, $2, 'doctor')`,
      [staffId, `proof doctor ${suffix}`],
    );
    await client.query(
      `INSERT INTO public.be_organization_members(organization_id, platform_user_id, role, status)
       VALUES ($1::uuid, $2::uuid, 'owner', 'active')`,
      [orgId, staffId],
    );
    await client.query(
      `INSERT INTO app_ext.variant_a_identity_refs(physical_user_id, opaque_ref, ref_kind)
       VALUES ($1::uuid, $2::uuid, 'actor')`,
      [staffId, actorRef],
    );
    clinics.push({ staff_id: staffId, org_id: orgId, actor_ref: actorRef, synthesized: true });
    if (say)
      say(
        `clinic ${orgId} synthesized inside the rollback transaction (DEV has ${real.rows.length})`,
      );
  }
  return clinics;
}

/** Роль врача ровно так, как её открывает webapp: mTLS-логин + принятый порт-контекст клиники. */
export async function installDoctorContext(client, capability, doctor) {
  await client.query(`SET LOCAL SESSION AUTHORIZATION ${capability.login}`);
  await client.query(
    `SELECT app.begin_port_context($1::uuid,
       ROW(1::smallint, 'staff'::app.port_context_class, 'app_staff'::name, 'relation',
           NULL::regprocedure, decode($2, 'hex'), $3::uuid, NULL::uuid, $4::uuid,
           NULL::bigint, NULL::uuid)::app.port_context_claims)`,
    [capability.capability_id, capability.args_hash, doctor.actor_ref, doctor.org_id],
  );
  const runtime = await client.query(
    `SELECT session_user AS login, current_user AS role, app.current_org_id()::text AS org`,
  );
  return runtime.rows[0];
}

/**
 * Возможность порт-контекста именованного корня — из КАНДИДАТНОГО артефакта, а не выдуманная: у
 * новых дверей ветки её на DEV ещё нет, а `require_accepted_context` без неё отказывает (42501).
 */
export async function installCandidateNamedRootCapability(client, functionIdentity, targetRole) {
  const source = fs.readFileSync(
    path.join(REPO ?? '', 'deploy/postgres/generated', `port-context-capabilities.${DB}.sql`),
    'utf8',
  );
  // У одной двери бывает несколько строк каталога — по одной на роль вызывающего. Без фильтра
  // берётся первая по файлу, и прогон молча меряет не тот вход, чем и обесценивается.
  const line = source
    .split('\n')
    .find(
      (candidate) =>
        candidate.includes(`'${functionIdentity}'::regprocedure`) &&
        (targetRole === undefined || candidate.includes(`'${targetRole}'::name`)),
    );
  if (!line) throw new Error(`candidate capability for ${functionIdentity} not found`);
  const values = [...line.matchAll(/'([^']*)'(?:::[a-z_. ]+)?/gu)].map((match) => match[1]);
  const [capabilityId, port, login, capabilityRole, contextClass, purpose] = values;
  // Строка каталога с этим `capability_id` в живой DEV уже может быть — от ПРЕЖНЕЙ сигнатуры двери
  // (`capability_id` детерминирован и сигнатуру не различает). `DO NOTHING` тогда молча оставил бы
  // указатель на старую функцию, и контекст отбивался бы «capability mismatch». Кандидатный
  // reconcile переписал бы строку — здесь то же самое, внутри транзакции с ROLLBACK.
  await client.query(
    `INSERT INTO app_ext.port_context_capabilities(capability_id, port, session_login, target_role,
       context_class, purpose, function_identity, active_from)
     VALUES ($1::uuid, $2::app.port_name, $3::name, $4::name, $5::app.port_context_class, $6,
             $7::regprocedure, now())
     ON CONFLICT (capability_id) DO UPDATE SET
       port = EXCLUDED.port, session_login = EXCLUDED.session_login,
       target_role = EXCLUDED.target_role, context_class = EXCLUDED.context_class,
       purpose = EXCLUDED.purpose, function_identity = EXCLUDED.function_identity,
       active_from = EXCLUDED.active_from, active_until = NULL`,
    [capabilityId, port, login, capabilityRole, contextClass, purpose, functionIdentity],
  );
  return { capability_id: capabilityId, login, purpose, function_identity: functionIdentity };
}

/** Порт-контекст ИМЕНОВАННОГО КОРНЯ: ровно то, что открывает `runWebappNamedRoot`. */
const TYPED_ARG_SEND = {
  uuid: ['uuid@1', 'uuid_send'],
  text: ['text@1', 'textsend'],
  boolean: ['boolean@1', 'boolsend'],
};

export async function installDoctorNamedRootContext(client, capability, doctor, args) {
  const typedArgs = args.map((argument) =>
    typeof argument === 'string' ? { type: 'uuid', value: argument } : argument,
  );
  const rows = typedArgs.map((argument, index) => {
    const recipe = TYPED_ARG_SEND[argument.type];
    if (!recipe) throw new Error(`unsupported typed arg '${argument.type}'`);
    return `ROW('${recipe[0]}', pg_catalog.${recipe[1]}($${index + 1}::${argument.type}))::app.port_typed_arg`;
  });
  // Хеш типизированных аргументов считается ДО смены авторизации: логину роли врача исполнять
  // `app.hash_port_typed_args` не положено, это делает рантайм до входа в контекст.
  const hash = await client.query(
    `SELECT encode(app.hash_port_typed_args(ARRAY[${rows.join(', ')}]), 'hex') AS args_hash`,
    typedArgs.map((argument) => argument.value),
  );
  await client.query(`SET LOCAL SESSION AUTHORIZATION ${capability.login}`);
  await client.query(
    `SELECT app.begin_port_context($1::uuid,
       ROW(1::smallint, 'staff'::app.port_context_class, 'app_staff'::name, $2,
           $3::regprocedure, decode($4, 'hex'), $5::uuid, NULL::uuid, $6::uuid,
           NULL::bigint, NULL::uuid)::app.port_context_claims)`,
    [
      capability.capability_id,
      capability.purpose,
      capability.function_identity,
      hash.rows[0].args_hash,
      doctor.actor_ref,
      doctor.org_id,
    ],
  );
}

/**
 * Порт-контекст ИМЕНОВАННОГО КОРНЯ класса `pre_session` — ровно то, что открывает bootstrap-принципал
 * webapp, когда записывает отложенный медицинский конфликт: ни организации, ни актора у него нет.
 */
export async function installPreSessionNamedRootContext(
  client,
  capability,
  typedArgs,
  requestId = '00000000-0000-4000-8000-0000000c4001',
) {
  const rows = typedArgs.map((argument, index) => {
    const recipe = TYPED_ARG_SEND[argument.type];
    if (!recipe) throw new Error(`unsupported typed arg '${argument.type}'`);
    return `ROW('${recipe[0]}', pg_catalog.${recipe[1]}($${index + 1}::${argument.type}))::app.port_typed_arg`;
  });
  // Хеш считается ДО смены авторизации: рантайм-логину исполнять `app.hash_port_typed_args` не положено.
  const hash = await client.query(
    `SELECT encode(app.hash_port_typed_args(ARRAY[${rows.join(', ')}]), 'hex') AS args_hash`,
    typedArgs.map((argument) => argument.value),
  );
  await client.query(`SET LOCAL SESSION AUTHORIZATION ${capability.login}`);
  await client.query(
    `SELECT app.begin_port_context($1::uuid,
       ROW(1::smallint, 'pre_session'::app.port_context_class, 'app_pre_session'::name, $2,
           $3::regprocedure, decode($4, 'hex'), NULL::uuid, NULL::uuid, NULL::uuid,
           NULL::bigint, $5::uuid)::app.port_context_claims)`,
    [
      capability.capability_id,
      capability.purpose,
      capability.function_identity,
      hash.rows[0].args_hash,
      // Класс `pre_session` обязан нести номер запроса и НЕ нести ни личности, ни организации:
      // человек ещё не вошёл, и привязать контекст можно только к запросу.
      requestId,
    ],
  );
}

/** Вернуться на место аудитора: рантайм-роли учётные таблицы не читают вовсе. */
export async function clearPortContext(client) {
  await client.query('RESET SESSION AUTHORIZATION');
  await client.query(
    `DELETE FROM app_ext.accepted_port_contexts
      WHERE backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id()
        AND cleared_at IS NULL`,
  );
}

export async function connect() {
  const client = new pg.Client({ host: '/var/run/postgresql', port: 5432, database: DB });
  await client.connect();
  const who = await client.query('SELECT current_database() AS db, current_user AS who');
  if (who.rows[0].db !== DB) throw new Error(`refusing to run against ${who.rows[0].db}`);
  return { client, db: who.rows[0].db, who: who.rows[0].who };
}

/** Прежнее имя того же действия — тела-доказательства двери врача зовут его так. */
export const clearDoctorContext = clearPortContext;
