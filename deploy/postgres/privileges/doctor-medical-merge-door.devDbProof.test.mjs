/**
 * Живое доказательство разбора медицинского конфликта слияния врачом на именованной базе DEV.
 * Кандидатная миграция и кандидатные права применяются ТОЛЬКО внутри транзакции с `ROLLBACK`;
 * `migrate-dev --execute` и reconcile этот файл не зовёт, постоянных строк не остаётся.
 *
 * Отказ, который он ловит (уже случившийся, D2/E1): «Слить» падает с
 * `permission denied for table user_password_credentials`, потому что перенос учётных строк идёт
 * под `app_staff`, а не за дверью `SECURITY DEFINER`. Оракул — живой PostgreSQL, а не наш же текст.
 *
 * Запуск:
 *   RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 node --test \
 *     deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
 *
 * Слепая поломка (у двери отбирают одну объявленную таблицу — proof обязан покраснеть):
 *   RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT=privilege node --test \
 *     deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
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
if (!['', 'privilege'].includes(FAULT)) {
  throw new Error(`unknown DOCTOR_MEDICAL_MERGE_DOOR_FAULT '${FAULT}'`);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const PROOF_BODY = path.join(scriptDir, 'doctor-medical-merge-door.proofBody.mjs');
const MIGRATION = 'apps/webapp/db/drizzle-migrations/20260914T220000_doctor_resolves_medical_merge_conflict.sql';
const PRIVILEGES = 'deploy/postgres/generated/privileges.bcb_webapp_dev.sql';

/**
 * Процесс обязан быть от OS-пользователя `postgres`: кандидатные объекты и роль врача живут в одной
 * транзакции, а суперпользователь здесь ходит только по peer-сокету. Каталог бокса `postgres` не
 * читает, поэтому и бандл, и оба артефакта переезжают в общедоступный временный каталог.
 */
function stage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcb-doctor-merge-proof-'));
  const esbuild = fs
    .readdirSync(path.join(repoRoot, 'node_modules/.pnpm'))
    .filter((entry) => entry.startsWith('@esbuild+linux-x64@'))
    .map((entry) =>
      path.join(repoRoot, 'node_modules/.pnpm', entry, 'node_modules/@esbuild/linux-x64/bin/esbuild'),
    )
    .find((candidate) => fs.existsSync(candidate));
  assert.ok(esbuild, 'esbuild недоступен — бандл proof-тела собрать нечем');

  // Свежий dist: proof обязан гонять код ветки, а не то, что лежало в dist с прошлой сборки.
  execFileSync('pnpm', ['--filter', '@bersoncare/platform-merge', 'build'], {
    cwd: repoRoot,
    stdio: 'pipe',
  });
  execFileSync(esbuild, [
    PROOF_BODY,
    '--bundle',
    '--platform=node',
    '--format=cjs',
    `--outfile=${path.join(dir, 'proof.cjs')}`,
    `--alias:pg=${path.join(repoRoot, 'apps/webapp/node_modules/pg')}`,
    `--alias:@bersoncare/platform-merge=${path.join(repoRoot, 'packages/platform-merge/dist/index.js')}`,
    '--external:pg-native',
    '--external:cloudflare:sockets',
  ], { stdio: 'pipe' });

  for (const relative of [MIGRATION, PRIVILEGES]) {
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

test('врач сливает медицинский конфликт целиком под своей рантайм-ролью', { skip: !ENABLED }, () => {
  const dir = stage();
  try {
    const output = runProof(dir);
    assert.match(output, /rolled back; fixture rows left in the database: 0/u, output);
    if (FAULT === 'privilege') {
      assert.match(output, /RESULT: FAIL/u, output);
      assert.match(output, /permission denied for table user_password_credentials/u, output);
      return;
    }
    assert.match(output, /runtime role installed: session_user=bcb_dev_webapp_staff current_user=app_staff/u, output);
    assert.match(output, /"mergeCompleted":true/u, output);
    assert.match(output, /RESULT: PASS/u, output);
    assert.doesNotMatch(output, /permission denied/u, output);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
