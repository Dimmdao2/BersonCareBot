import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePortAgents } from './ci-preflight.mjs';

// `pgrep -af agent-run.mjs` печатает ЛЮБУЮ строку с этой подстрокой. Среди них — оболочка,
// внутри которой сам preflight и запускается: её командная строка несёт и «agent-run.mjs»,
// и «--sandbox workspace-write», если эти слова просто упомянуты в скрипте. 20.08 гейт на
// пустом дереве без единого агента объявил писателем собственную bash-обёртку и отказал.
const SHELL_WRAPPER = '889249 /bin/bash -c eval \'pgrep -af agent-run.mjs; echo --sandbox workspace-write\'';
const REAL_WORKER = '789739 node /home/dev/brain/host-orch/agent-run.mjs --provider claude '
  + '--sandbox workspace-write --run-id seatdoor-20260820';
const REAL_AUDITOR = '815314 node /home/dev/brain/host-orch/agent-run.mjs --provider claude '
  + '--sandbox read-only --run-id auditseatdoor-20260820';

test('оболочка, упомянувшая agent-run.mjs, не считается агентом', () => {
  assert.deepEqual(parsePortAgents(`${SHELL_WRAPPER}\n`), []);
});

test('настоящий воркер найден и считается писателем', () => {
  const agents = parsePortAgents(`${REAL_WORKER}\n`);
  assert.equal(agents.length, 1);
  assert.equal(agents[0].runId, 'seatdoor-20260820');
  assert.equal(agents[0].readOnly, false);
});

test('read-only аудитор найден, но писателем не считается', () => {
  const agents = parsePortAgents(`${REAL_AUDITOR}\n`);
  assert.equal(agents.length, 1);
  assert.equal(agents[0].readOnly, true);
});

test('оболочка отсеивается, соседний настоящий агент — нет', () => {
  const agents = parsePortAgents(`${SHELL_WRAPPER}\n${REAL_WORKER}\n${REAL_AUDITOR}\n`);
  assert.deepEqual(agents.map((a) => a.runId), ['seatdoor-20260820', 'auditseatdoor-20260820']);
  assert.equal(agents.filter((a) => !a.readOnly).length, 1);
});

test('пустой вывод pgrep — пустой список', () => {
  assert.deepEqual(parsePortAgents(''), []);
});
