import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const checker = resolve(root, 'scripts/check-b0-migration-baseline.mjs');

function runGate() {
  return spawnSync(process.execPath, [checker], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15_000,
  });
}

function expectKilled(relativePath, source) {
  const absolutePath = resolve(root, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source);
  try {
    const result = runGate();
    assert.notEqual(
      result.status,
      0,
      `active disposable/replay executor survived: ${relativePath}\n${result.stdout}${result.stderr}`,
    );
  } finally {
    rmSync(absolutePath, { force: true });
  }
}

test('rejects executable database creation through the pg client, not only createdb', () => {
  expectKilled(
    'scripts/__named_dev_pg_create.mjs',
    "import pg from 'pg';\nconst client = new pg.Client();\nawait client.query('CREATE DATABASE bcb_throwaway');\n",
  );
});

test('rejects psql meta-command replay passed through -c', () => {
  expectKilled(
    'scripts/__named_dev_psql_meta_replay.sh',
    "#!/bin/sh\npsql \"$DATABASE_URL\" -c '\\\\i history.sql'\n",
  );
});

test('rejects a callable Python createdb executor', () => {
  expectKilled(
    'tools/__named_dev_db_task.py',
    "import subprocess\nsubprocess.run(['createdb', 'bcb_throwaway'], check=True)\n",
  );
});

test('rejects case, spacing and alternate include equivalents', () => {
  for (const [path, source] of [
    [
      'tools/__named_dev_pg_drop.mts',
      "const client = getClient();\nawait client . query( `  DrOp  DaTaBaSe bcb_throwaway` );\n",
    ],
    [
      'scripts/__named_dev_psql_ir.sh',
      "#!/bin/sh\npsql \"$DATABASE_URL\" --command '\\ir history.sql'\n",
    ],
    [
      'tools/__named_dev_python_db_client.py',
      "cursor . execute(\"  CREATE   DATABASE bcb_throwaway\")\n",
    ],
    [
      'tools/__named_dev_python_dropdb.py',
      "import subprocess\nsubprocess . run(\"DROPDB bcb_throwaway\", shell=True, check=True)\n",
    ],
  ]) {
    expectKilled(path, source);
  }
});

test('rejects database DDL passed to a client through a local variable', () => {
  expectKilled(
    'tools/__named_dev_variable_db_ddl.mjs',
    "const client = getClient();\nconst statement = 'CREATE DATABASE bcb_throwaway';\nawait client.query(statement);\n",
  );
});

test('rejects history replay piped into psql stdin', () => {
  expectKilled(
    'scripts/__named_dev_pipe_history.sh',
    '#!/bin/sh\ncat apps/webapp/db/history.sql | psql "$DATABASE_URL"\n',
  );
});

test('rejects history replay through a psql heredoc with an arbitrary delimiter', () => {
  expectKilled(
    'scripts/__named_dev_heredoc_history.sh',
    '#!/bin/sh\npsql "$DATABASE_URL" <<\'EOF\'\n\\i apps/webapp/db/history.sql\nEOF\n',
  );
});

test('rejects history replay supplied to a psql child process through stdin', () => {
  expectKilled(
    'tools/__named_dev_spawn_stdin.mjs',
    "import { readFileSync } from 'node:fs';\nimport { spawnSync } from 'node:child_process';\nspawnSync('psql', [], { input: readFileSync('apps/webapp/db/history.sql') });\n",
  );
});

test('rejects an unmarked active-doc reference but permits a truthful historical notice', () => {
  const retired = 'apps/webapp/scripts/check-branches-quota-race.mjs';
  expectKilled(
    'docs/__named_dev_active_instruction.md',
    `Run \`node ${retired}\` before merging.\n`,
  );
  const marked = resolve(root, 'docs/__named_dev_historical_record.md');
  writeFileSync(
    marked,
    '> **Retired-path notice.** Any command or path below that targets a pre-B0 retired database executor is preserved only as historical evidence; it is not runnable or current guidance. Other content in this document is unchanged. See [the current B0 retirement rule](/docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md).\n\n' +
      `Historical command: \`node ${retired}\` — PASS in 2026-07.\n`,
  );
  try {
    const result = runGate();
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  } finally {
    rmSync(marked, { force: true });
  }
});

test('kills all six semantic executor bypasses from combined audit one', { concurrency: false }, () => {
  for (const [path, source] of [
    [
      'scripts/__combined_audit_variable_psql.mjs',
      "import { spawnSync } from 'node:child_process';\nconst executable = 'psql';\nconst historySql = 'history.sql';\nspawnSync(executable, ['-f', historySql]);\n",
    ],
    [
      'scripts/__combined_audit_variable_createdb.sh',
      '#!/bin/sh\ndatabase_tool=createdb; "$database_tool" bcb_throwaway\n',
    ],
    [
      'tools/__combined_audit_os_system.py',
      "import os\nos.system('createdb bcb_throwaway')\n",
    ],
    ['tools/__combined_audit_postgres/Dockerfile', 'FROM postgres:17\nRUN echo active\n'],
    [
      'scripts/__combined_audit_printf_include.sh',
      "#!/bin/sh\nprintf '\\i history.sql\\n' | psql \"$DATABASE_URL\"\n",
    ],
    [
      'tools/__combined_audit_concatenated_ddl.mjs',
      "const client = getClient();\nconst statement = 'CREATE ' + 'DATABASE bcb_throwaway';\nawait client.query(statement);\n",
    ],
  ]) {
    expectKilled(path, source);
  }
});

// Re-audit one, finding 2: a static argument/command list bound to a local name is the same callable
// as the inline literal, so the semantic scanners must propagate it into the process call.
test('kills static command lists bound to a local name in JS and Python', () => {
  for (const [path, source] of [
    [
      'scripts/__reaudit_one_js_argument_list.mjs',
      "import { spawnSync } from 'node:child_process';\nconst executable = 'psql';\nconst history = 'history.sql';\nconst args = ['-f', history];\nspawnSync(executable, args);\n",
    ],
    [
      'scripts/__reaudit_one_js_command_list.mjs',
      "import { execFileSync } from 'node:child_process';\nconst command = ['createdb', 'bcb_throwaway'];\nexecFileSync(...command);\n",
    ],
    [
      'tools/__reaudit_one_python_command_list.py',
      "import subprocess\nname = 'bcb_throwaway'\ncommand = ['createdb', name]\nsubprocess.run(command, check=True)\n",
    ],
    [
      'tools/__reaudit_one_python_psql_list.py',
      "import subprocess\nhistory = 'history.sql'\ncommand = ['psql', '-f', history]\nsubprocess.Popen(command)\n",
    ],
  ]) {
    expectKilled(path, source);
  }
});
