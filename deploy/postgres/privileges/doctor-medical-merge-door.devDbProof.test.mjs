/**
 * Живые доказательства разбора медицинского конфликта слияния врачом на именованной базе DEV.
 * Кандидатная миграция и кандидатные права применяются ТОЛЬКО внутри транзакции с `ROLLBACK`;
 * `migrate-dev --execute` и reconcile этот файл не зовёт, постоянных строк не остаётся.
 *
 * Отказы, которые он ловит. E1/Д1/Д2 уже случались; Д3 — стена, которая сегодня стоит, и прогон
 * держит её от сноса: §10a разрешает тест ровно там, где «снесли проверку — набор покраснел».
 *  E1 — «Слить» падает с `permission denied for table user_password_credentials`, потому что
 *       перенос учётных строк идёт под `app_staff`, а не за дверью `SECURITY DEFINER`;
 *  Д1 — конфликт есть в двух клиниках, врач первой жмёт «слить», ничего не сливается, а конфликт
 *       уходит с его индикатора и маршрут отвечает успехом;
 *  Д2 — `app_staff` сам вписывает себе основание для двери и двигает чужие учётные строки;
 *  Д3 — врач ЧУЖОЙ организации со своим законным контекстом и известным `conflictId` проходит
 *       дверь конфликта соседней клиники: дверь ставит от его имени отметку «врач одобрил» на
 *       строку этой клиники, и последний блокер пары снимается без её решения;
 *  Ф1 — человек выбрал, какое ФИО оставить, медицинский блокер отложил слияние до врача, и после
 *       «Слить» у человека молча осталась подпись целевой учётки — выбранная движком, а не им.
 *
 * Оракул — живой PostgreSQL, а не наш же текст.
 *
 * Запуск (весь набор):
 *   RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 node --test \
 *     deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
 *
 * Слепые поломки — каждая возвращает поверхность к состоянию отказа, прогон обязан покраснеть:
 *   DOCTOR_MEDICAL_MERGE_DOOR_FAULT=privilege            (у двери отбирают объявленную таблицу)
 *   DOCTOR_MEDICAL_MERGE_DOOR_FAULT=two-clinic-blindness (дверь не видит блокер второй клиники)
 *   DOCTOR_MEDICAL_MERGE_DOOR_FAULT=staff-insert         (роли врача возвращают колоночный INSERT)
 *   DOCTOR_MEDICAL_MERGE_DOOR_FAULT=foreign-org-conflict (дверь не сверяет организацию конфликта)
 *   DOCTOR_MEDICAL_MERGE_DOOR_FAULT=fio-decision-not-persisted (строка конфликта снова теряет ответ
 *                                                               человека про ФИО)
 *   DOCTOR_MEDICAL_MERGE_DOOR_FAULT=support-always-escalates (отказ всегда уезжает в поддержку)
 *   DOCTOR_MEDICAL_MERGE_DOOR_FAULT=decision-stays-pending (после решения остаётся красный pending)
 *   DOCTOR_MEDICAL_MERGE_DOOR_FAULT=comment-not-saved (решение теряет комментарий врача)
 *   DOCTOR_MEDICAL_MERGE_DOOR_FAULT=approval-comment-not-saved (подтверждение теряет комментарий)
 *   DOCTOR_MEDICAL_MERGE_DOOR_FAULT=refusal-read-any-org  (дверь следа отказа не сверяет организацию)
 *   DOCTOR_MEDICAL_MERGE_DOOR_FAULT=refusal-write-any-org (дверь записи отказа не сверяет организацию)
 *   DOCTOR_MEDICAL_MERGE_DOOR_FAULT=refusal-read-any-status (след отказа отдаётся по ещё не
 *                                                            разобранному pending)
 *   DOCTOR_MEDICAL_MERGE_DOOR_FAULT=refusal-read-any-reason (немедицинский кандидат отдаётся как
 *                                                            медицинский след отказа)
 *   DOCTOR_MEDICAL_MERGE_DOOR_FAULT=approval-comment-foreign-row (подтверждение пишет комментарий
 *                                                            в строку чужой клиники)
 *
 * ⛔ КРИТЕРИЙ ПОЛНОТЫ НАБОРА (введён после четвёртого круга аудита, уточнён после пятого, 15.09).
 * Доказательство обязано краснеть на снятии каждого предиката ДОПУСКА К РЕШЕНИЮ — то есть того,
 * который отвечает на четыре вопроса: КТО решает (организация), КАКУЮ строку (идентификатор пары и
 * конфликта), ДОПУСТИМО ЛИ решение сейчас (состояние строки и род данных) и ЧЕМ оно обосновано
 * (обязательный комментарий врача). Перечень конечен и записан ниже; предложения по строкам, которые
 * ПЕРЕНОСЯТ данные уже ПОСЛЕ принятого решения, в него намеренно не входят — их стережёт результат
 * слияния, а не отдельная поломка. Новый предикат допуска обязан приехать со своей поломкой сюда.
 *
 *   read_staff_patient_medical_merge_refusal: organization_id → refusal-read-any-org;
 *     status IN (dismissed, escalated) → refusal-read-any-status;
 *     reason LIKE medical_history:% → refusal-read-any-reason.
 *   refuse_staff_patient_medical_merge_conflict: organization_id → refusal-write-any-org;
 *     id = p_conflict_id → refusal-write-any-row; status = pending → refusal-write-any-status;
 *     reason LIKE medical_history:% → refusal-write-any-reason;
 *     обязательность комментария → refusal-comment-optional;
 *     запись комментария → comment-not-saved; признак поддержки → support-always-escalates;
 *     гашение красного входа → decision-stays-pending.
 *   transfer_staff_approved_platform_user_merge_data (5 арг.): organization_id в записи
 *     комментария → approval-comment-foreign-row; status = pending → approval-any-status;
 *     reason LIKE medical_history:% → approval-any-reason;
 *     обязательность комментария → approval-comment-optional;
 *     запись комментария → approval-comment-not-saved;
 *     обе стены организации сразу → foreign-org-conflict;
 *     id строки записи → approval-write-any-row; обе половины пары записи → approval-write-any-pair;
 *     ответ человека про ФИО → fio-decision-not-persisted.
 *   transfer (4 арг., внутренняя): блокер медицинской истории другой клиники →
 *     two-clinic-blindness; признание решения соседней клиники: organization_id →
 *     neighbour-approval-any-org, status → neighbour-approval-any-status, reason →
 *     neighbour-approval-any-reason, doctorApproved → neighbour-approval-not-required, пара →
 *     neighbour-approval-any-pair; собственный допуск роли врача → staff-insert, privilege.
 *   read refusal: id строки → refusal-read-any-row.
 *
 * `DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1` печатает журнал каждого прогона, в том числе зелёного.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ENABLED = process.env.RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB === '1';
const FAULT = process.env.DOCTOR_MEDICAL_MERGE_DOOR_FAULT ?? '';
if (
  ![
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
  ].includes(FAULT)
) {
  throw new Error(`unknown DOCTOR_MEDICAL_MERGE_DOOR_FAULT '${FAULT}'`);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const MIGRATIONS = [
  'apps/webapp/db/drizzle-migrations/20260914T220000_doctor_resolves_medical_merge_conflict.sql',
  'apps/webapp/db/drizzle-migrations/20260915T102455_doctor_merge_decision_has_a_record.sql',
  'apps/webapp/db/drizzle-migrations/20260915T150000_the_person_fio_answer_survives_the_doctor_defer.sql',
];
const PRIVILEGES = 'deploy/postgres/generated/privileges.bcb_webapp_dev.sql';
const PORT_CONTEXT = 'deploy/postgres/generated/port-context-capabilities.bcb_webapp_dev.sql';

/**
 * Процесс обязан быть от OS-пользователя `postgres`: кандидатные объекты и роль врача живут в одной
 * транзакции, а суперпользователь здесь ходит только по peer-сокету. Каталог бокса `postgres` не
 * читает, поэтому и бандл, и оба артефакта переезжают в общедоступный временный каталог.
 */
function stage(bodyFile) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcb-doctor-merge-proof-'));
  const esbuild = fs
    .readdirSync(path.join(repoRoot, 'node_modules/.pnpm'))
    .filter((entry) => entry.startsWith('@esbuild+linux-x64@'))
    .map((entry) =>
      path.join(
        repoRoot,
        'node_modules/.pnpm',
        entry,
        'node_modules/@esbuild/linux-x64/bin/esbuild',
      ),
    )
    .find((candidate) => fs.existsSync(candidate));
  assert.ok(esbuild, 'esbuild недоступен — бандл проф-тела собрать нечем');

  // Свежий dist: proof обязан гонять код ветки, а не то, что лежало в dist с прошлой сборки.
  execFileSync('pnpm', ['--filter', '@bersoncare/platform-merge', 'build'], {
    cwd: repoRoot,
    stdio: 'pipe',
  });
  execFileSync(
    esbuild,
    [
      path.join(scriptDir, bodyFile),
      '--bundle',
      '--platform=node',
      '--format=cjs',
      `--outfile=${path.join(dir, 'proof.cjs')}`,
      `--alias:pg=${path.join(repoRoot, 'apps/webapp/node_modules/pg')}`,
      `--alias:@bersoncare/platform-merge=${path.join(repoRoot, 'packages/platform-merge/dist/index.js')}`,
      '--external:pg-native',
      '--external:cloudflare:sockets',
    ],
    { stdio: 'pipe' },
  );

  for (const relative of [...MIGRATIONS, PRIVILEGES, PORT_CONTEXT]) {
    const destination = path.join(dir, 'repo', relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(repoRoot, relative), destination);
  }
  execFileSync('chmod', ['-R', 'a+rX', dir]);
  return dir;
}

function runProof(dir) {
  try {
    return execFileSync(
      'sudo',
      [
        '-n',
        '-u',
        'postgres',
        'env',
        `BCB_PROOF_REPO=${path.join(dir, 'repo')}`,
        `BCB_PROOF_FAULT=${FAULT}`,
        '/usr/bin/node',
        path.join(dir, 'proof.cjs'),
      ],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
  } catch (err) {
    // Тело помечает провал ненулевым кодом — вывод важнее кода.
    return `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }
}

function readJsonLine(output, label) {
  const prefix = `${label}: `;
  const lines = output.split('\n').filter((line) => line.startsWith(prefix));
  assert.equal(lines.length, 1, `expected exactly one ${label} line:\n${output}`);
  return JSON.parse(lines[0].slice(prefix.length));
}

function proof(bodyFile, assertions) {
  const dir = stage(bodyFile);
  try {
    const output = runProof(dir);
    // Журнал прогона нужен и когда всё зелёное: им отчитываются о живой проверке.
    if (process.env.DOCTOR_MEDICAL_MERGE_DOOR_ECHO === '1') process.stdout.write(`${output}\n`);
    assert.deepEqual(readJsonLine(output, 'ROLLBACK_FACTS'), { fixtureRows: 0 }, output);
    assertions(output);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test(
  'врач сливает медицинский конфликт целиком под своей рантайм-ролью',
  { skip: !ENABLED },
  () => {
    proof('doctor-medical-merge-door.proofBody.mjs', (output) => {
      const facts = readJsonLine(output, 'FACTS');
      assert.equal(facts.runtime.role, 'app_staff', output);
      assert.equal(facts.runtime.org, facts.clinicOrg, output);
      assert.equal(facts.mergeOutcome, 'merged', output);
      assert.deepEqual(
        facts.state,
        {
          duplicate_merged_into: '00000000-0000-4000-8000-00000000e1a1',
          duplicate_credentials: 0,
          target_visits: 2,
          conflict_status: 'resolved',
        },
        output,
      );
    });
  },
);

test(
  'решение врача хранит комментарий, гасит pending и только явно отправляет обращение',
  { skip: !ENABLED },
  () => {
    proof('doctor-medical-merge-decision.proofBody.mjs', (output) => {
      const facts = readJsonLine(output, 'FACTS');
      assert.deepEqual(
        facts.local,
        {
          status: 'dismissed',
          doctor_comment: 'Это разные люди; обращение в поддержку не требуется',
          support_requested: false,
          support_rows: 0,
          pending_rows: 0,
          target_marks: 1,
          duplicate_marks: 1,
        },
        output,
      );
      assert.equal(
        facts.details.doctorComment,
        'Это разные люди; обращение в поддержку не требуется',
        output,
      );
      assert.equal(facts.details.partyCount, 2, output);
      assert.deepEqual(facts.details.contactValues, ['+79990000002', 'one@example.test'], output);
      assert.equal(facts.details.resolvedByUserId, facts.details.expectedResolverUserId, output);
      assert.equal(facts.details.initiatedByUserId, '00000000-0000-4000-8000-00000000a4c1', output);
      assert.deepEqual(
        facts.support,
        {
          status: 'escalated',
          doctor_comment: 'Это разные люди; нужен разбор техподдержки',
          support_requested: true,
          support_rows: 1,
        },
        output,
      );
    });
  },
);

test(
  'конфликт в двух клиниках: первому врачу говорят правду, второй доводит слияние',
  { skip: !ENABLED },
  () => {
    proof('doctor-medical-merge-two-clinics.proofBody.mjs', (output) => {
      const facts = readJsonLine(output, 'FACTS');
      assert.deepEqual(
        facts.neighbourAdmission,
        {
          wrongOrg: { outcome: 'awaiting_other_organization', duplicateMergedInto: null },
          closed: { outcome: 'awaiting_other_organization', duplicateMergedInto: null },
          nonMedical: { outcome: 'awaiting_other_organization', duplicateMergedInto: null },
          notApproved: { outcome: 'awaiting_other_organization', duplicateMergedInto: null },
          wrongPair: { outcome: 'awaiting_other_organization', duplicateMergedInto: null },
        },
        output,
      );
      assert.equal(facts.firstOutcome, 'awaiting_other_organization', output);
      assert.equal(facts.pendingAfterFirst, 0, output);
      assert.deepEqual(
        facts.afterFirst,
        {
          duplicate_merged_into: null,
          duplicate_credentials: 1,
          target_credentials: 1,
          clinic_a_row: 'resolved/true/Клиника A подтверждает совпадение',
          clinic_b_row: 'pending/null',
        },
        output,
      );
      assert.equal(facts.secondOutcome, 'merged', output);
      assert.deepEqual(
        facts.afterSecond,
        {
          duplicate_merged_into: '00000000-0000-4000-8000-00000000d1a1',
          duplicate_credentials: 0,
          clinic_a_row: 'resolved',
          clinic_b_row: 'resolved',
          target_visits: 4,
        },
        output,
      );
    });
  },
);

test('роль врача не может выписать себе основание для двери', { skip: !ENABLED }, () => {
  proof('doctor-medical-merge-forged-conflict.proofBody.mjs', (output) => {
    const facts = readJsonLine(output, 'FACTS');
    assert.equal(facts.forgeRefusal.code, '42501', output);
    assert.equal(facts.doorOutcome, null, output);
    assert.deepEqual(facts.state, { tgt_creds: 1, dup_creds: 1, forged_rows: 0 }, output);
  });
});

test(
  'врач чужой организации не проходит дверь конфликта соседней клиники',
  { skip: !ENABLED },
  () => {
    // Ветки «под этой поломкой ждём FAIL» здесь намеренно НЕТ: она инвертирует сигнал и делает
    // прогон под инъекцией зелёным. Этот сценарий обязан краснеть по-настоящему — им и доказывается,
    // что снос сверки организации в двери набор замечает.
    proof('doctor-medical-merge-foreign-org.proofBody.mjs', (output) => {
      const facts = readJsonLine(output, 'FACTS');
      assert.equal(facts.attempt.mergeOutcome, 'conflict_not_found', output);
      assert.deepEqual(
        facts.state,
        {
          duplicate_merged_into: null,
          duplicate_credentials: 1,
          target_credentials: 1,
          clinic_a_row: 'pending/null',
          clinic_a_comment: null,
          clinic_b_row: 'pending/null',
        },
        output,
      );
    });
  },
);

test(
  'врач чужой организации не читает и не переписывает отказ соседней клиники',
  { skip: !ENABLED },
  () => {
    // Ветки «под этой поломкой ждём FAIL» здесь намеренно НЕТ: она инвертирует сигнал и красит
    // прогон под инъекцией зелёным. Этот сценарий обязан краснеть по-настоящему.
    proof('doctor-medical-merge-refusal-foreign-org.proofBody.mjs', (output) => {
      // Сверяем ЗНАЧЕНИЯ из машиночитаемой строки, а не английские фразы журнала: переформулировка
      // диагностики поведение не меняет и красить прогон не должна (§10a — тест не дублирует текст).
      const facts = readJsonLine(output, 'FACTS');
      // Row-selection faults must reach observable database state, not merely throw before FACTS.
      assert.deepEqual(
        facts.neighbourRows,
        {
          pending: { status: 'pending', doctor_comment: null, resolvedBy: null },
          nonMedical: {
            status: 'dismissed',
            doctor_comment: 'Разбор не про медицинские данные',
            resolvedBy: null,
          },
          pendingNonMedical: { status: 'pending', doctor_comment: null, resolvedBy: null },
          ownResolved: {
            status: 'dismissed',
            doctor_comment: 'Клиника А: это разные люди, я их обоих веду',
            resolvedBy: 'clinicA_doctor',
          },
        },
        output,
      );
      assert.equal(facts.foreignRefusalAccepted, false, output);
      assert.deepEqual(
        facts.conflictAfterForeignRefusal,
        {
          status: 'pending',
          doctor_comment: null,
          support_requested: null,
          resolved_by: null,
          platform_requests: 0,
        },
        output,
      );
      assert.equal(facts.ownTraceComment, 'Клиника А: это разные люди, я их обоих веду', output);
      assert.deepEqual(
        facts.marks,
        { clinicA_target: 1, clinicA_duplicate: 1, clinicB_target: 0 },
        output,
      );
      assert.equal(facts.foreignTraceRead, null, output);
      // Своя клиника, но состояние без решения врача и разбор не про медицинские данные: следа
      // отказа у обоих быть не может, и молчание двери здесь стережёт предикаты `status` и `reason`.
      assert.equal(facts.pendingTraceRead, null, output);
      assert.equal(facts.nonMedicalTraceRead, null, output);
      assert.equal(facts.wrongRowTraceRead, null, output);
      // Допуск к решению: обе двери обязаны отказать. Пустой комментарий — ошибка данных 22023;
      // повторный разбор и немедицинский кандидат — «строки для решения нет».
      assert.deepEqual(
        facts.admission,
        {
          emptyCommentRefusal: '22023',
          emptyCommentApproval: '22023',
          approvalWithWrongRow: 'conflict_not_found',
          approvalWithWrongPair: 'conflict_not_found',
          secondRefusalOfResolved: false,
          approvalOfResolved: 'conflict_not_found',
          refusalOfNonMedical: false,
          approvalOfNonMedical: 'conflict_not_found',
          refusalOfPendingNonMedical: false,
          approvalOfPendingNonMedical: 'conflict_not_found',
        },
        output,
      );
      // Соседние строки той же клиники ни одна дверь не трогает.
    });
  },
);

test(
  'выбранное человеком ФИО переживает медицинский defer и одобрение врача',
  { skip: !ENABLED },
  () => {
    // Ветки «под этой поломкой ждём FAIL» здесь НЕТ намеренно: она инвертирует сигнал и красит
    // прогон под инъекцией зелёным. Этот сценарий обязан краснеть по-настоящему.
    proof('doctor-medical-merge-fio.proofBody.mjs', (output) => {
      const facts = readJsonLine(output, 'FACTS');
      assert.equal(facts.medicalBlockerCarriedDecision, true, output);
      assert.equal(facts.keptOutcome, 'merged', output);
      assert.deepEqual(
        facts.kept,
        {
          users_last_name: 'Сидоров',
          users_display_name: 'Сидоров Пётр',
          identity_last_name: 'Сидоров',
          duplicate_merged_into: '00000000-0000-4000-8000-00000000f2a1',
        },
        output,
      );
      assert.deepEqual(
        facts.lostOrientation,
        {
          anchor: '00000000-0000-4000-8000-00000000f2b2',
          candidate: '00000000-0000-4000-8000-00000000f2b1',
        },
        output,
      );
      assert.equal(facts.lostOutcome, 'fio_decision_required', output);
      assert.equal(facts.lost.duplicate_merged_into, null, output);
      assert.equal(facts.recoveredSameConflict, true, output);
      assert.equal(facts.recoveredOutcome, 'merged', output);
      assert.equal(facts.recovered.users_last_name, 'Сидоров', output);
      assert.equal(facts.recovered.identity_last_name, 'Сидоров', output);
      assert.equal(
        facts.recovered.duplicate_merged_into,
        '00000000-0000-4000-8000-00000000f2b1',
        output,
      );
      assert.deepEqual(
        facts.targetOrientation,
        {
          anchor: '00000000-0000-4000-8000-00000000f2d2',
          candidate: '00000000-0000-4000-8000-00000000f2d1',
        },
        output,
      );
      assert.equal(facts.targetOutcome, 'merged', output);
      assert.equal(facts.targetFio.users_last_name, 'Иванов', output);
      assert.equal(facts.targetFio.identity_last_name, 'Иванов', output);
      assert.equal(
        facts.targetFio.duplicate_merged_into,
        '00000000-0000-4000-8000-00000000f2d1',
        output,
      );
      assert.equal(facts.foreignOutcome, 'fio_decision_required', output);
      assert.equal(facts.foreignUnchanged, true, output);
    });
  },
);
