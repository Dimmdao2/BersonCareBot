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
 *       строку этой клиники, и последний блокер пары снимается без её решения.
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
if (!['', 'privilege', 'two-clinic-blindness', 'staff-insert', 'foreign-org-conflict'].includes(FAULT)) {
  throw new Error(`unknown DOCTOR_MEDICAL_MERGE_DOOR_FAULT '${FAULT}'`);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const MIGRATION = 'apps/webapp/db/drizzle-migrations/20260914T220000_doctor_resolves_medical_merge_conflict.sql';
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
      path.join(repoRoot, 'node_modules/.pnpm', entry, 'node_modules/@esbuild/linux-x64/bin/esbuild'),
    )
    .find((candidate) => fs.existsSync(candidate));
  assert.ok(esbuild, 'esbuild недоступен — бандл проф-тела собрать нечем');

  // Свежий dist: proof обязан гонять код ветки, а не то, что лежало в dist с прошлой сборки.
  execFileSync('pnpm', ['--filter', '@bersoncare/platform-merge', 'build'], {
    cwd: repoRoot,
    stdio: 'pipe',
  });
  execFileSync(esbuild, [
    path.join(scriptDir, bodyFile),
    '--bundle',
    '--platform=node',
    '--format=cjs',
    `--outfile=${path.join(dir, 'proof.cjs')}`,
    `--alias:pg=${path.join(repoRoot, 'apps/webapp/node_modules/pg')}`,
    `--alias:@bersoncare/platform-merge=${path.join(repoRoot, 'packages/platform-merge/dist/index.js')}`,
    '--external:pg-native',
    '--external:cloudflare:sockets',
  ], { stdio: 'pipe' });

  for (const relative of [MIGRATION, PRIVILEGES, PORT_CONTEXT]) {
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
      ['-n', '-u', 'postgres', 'env', `BCB_PROOF_REPO=${path.join(dir, 'repo')}`,
       `BCB_PROOF_FAULT=${FAULT}`, '/usr/bin/node', path.join(dir, 'proof.cjs')],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
  } catch (err) {
    // Тело помечает провал ненулевым кодом — вывод важнее кода.
    return `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }
}

function proof(bodyFile, assertions) {
  const dir = stage(bodyFile);
  try {
    const output = runProof(dir);
    // Журнал прогона нужен и когда всё зелёное: им отчитываются о живой проверке.
    if (process.env.DOCTOR_MEDICAL_MERGE_DOOR_ECHO === '1') process.stdout.write(`${output}\n`);
    assert.match(output, /rolled back; fixture rows left in the database: 0/u, output);
    assertions(output);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('врач сливает медицинский конфликт целиком под своей рантайм-ролью', { skip: !ENABLED }, () => {
  proof('doctor-medical-merge-door.proofBody.mjs', (output) => {
    if (FAULT === 'privilege') {
      assert.match(output, /RESULT: FAIL/u, output);
      assert.match(output, /permission denied for table user_password_credentials/u, output);
      return;
    }
    assert.match(output, /runtime role installed: session_user=bcb_dev_webapp_staff current_user=app_staff/u, output);
    assert.match(output, /"mergeOutcome":"merged"/u, output);
    assert.match(output, /RESULT: PASS/u, output);
    assert.doesNotMatch(output, /permission denied/u, output);
  });
});

test('конфликт в двух клиниках: первому врачу говорят правду, второй доводит слияние', { skip: !ENABLED }, () => {
  proof('doctor-medical-merge-two-clinics.proofBody.mjs', (output) => {
    if (FAULT === 'two-clinic-blindness' || FAULT === 'privilege') {
      assert.match(output, /RESULT: FAIL/u, output);
      return;
    }
    assert.match(output, /doctor A merge returned: .*"mergeOutcome":"awaiting_other_organization"/u, output);
    assert.match(output, /doctor A still sees his conflict: yes, doctorApproved=true/u, output);
    assert.match(output, /"duplicate_merged_into":null/u, output);
    assert.match(output, /doctor B merge returned: .*"mergeOutcome":"merged"/u, output);
    assert.match(output, /RESULT: PASS/u, output);
  });
});

test('роль врача не может выписать себе основание для двери', { skip: !ENABLED }, () => {
  proof('doctor-medical-merge-forged-conflict.proofBody.mjs', (output) => {
    if (FAULT === 'staff-insert') {
      assert.match(output, /INSERT SUCCEEDED/u, output);
      assert.match(output, /RESULT: FAIL/u, output);
      return;
    }
    assert.match(output, /forgery refused: 42501 permission denied for table patient_merge_candidates/u, output);
    assert.match(output, /"dup_creds":1/u, output);
    assert.match(output, /RESULT: PASS/u, output);
  });
});

test('врач чужой организации не проходит дверь конфликта соседней клиники', { skip: !ENABLED }, () => {
  proof('doctor-medical-merge-foreign-org.proofBody.mjs', (output) => {
    if (FAULT === 'foreign-org-conflict') {
      assert.match(output, /RESULT: FAIL/u, output);
      return;
    }
    assert.match(output, /doctor B pressed merge on clinic A's conflict, door returned: .*"mergeOutcome":"conflict_not_found"/u, output);
    assert.match(output, /"clinic_a_row":"pending\/null"/u, output);
    assert.match(output, /"duplicate_merged_into":null/u, output);
    assert.match(output, /RESULT: PASS/u, output);
  });
});
