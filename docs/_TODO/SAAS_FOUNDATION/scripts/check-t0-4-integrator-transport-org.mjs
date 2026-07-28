#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();

const files = {
  messageThreads: 'apps/integrator/src/infra/db/repos/messageThreads.ts',
  messageThreadsTest: 'apps/integrator/src/infra/db/repos/messageThreads.test.ts',
  mergeConversation: 'apps/integrator/src/infra/db/repos/mergeIntegratorConversationToPlatform.ts',
};

function read(path) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function assertContains(name, text, needle) {
  if (!text.includes(needle)) {
    throw new Error(`${name} missing required text: ${needle}`);
  }
}

function runChecks(overrides = {}) {
  const messageThreads = overrides.messageThreads ?? read(files.messageThreads);
  const messageThreadsTest = overrides.messageThreadsTest ?? read(files.messageThreadsTest);
  const mergeConversation = overrides.mergeConversation ?? read(files.mergeConversation);

  for (const needle of [
    'INSERT INTO message_drafts (',
    'organization_id = COALESCE(EXCLUDED.organization_id, message_drafts.organization_id)',
    'INSERT INTO conversations (',
    'INSERT INTO conversation_messages (',
    'SELECT organization_id FROM conversations',
    'INSERT INTO user_questions (id, user_identity_id, conversation_id, organization_id',
    'parent.organization_id, ti.organization_id)',
    'INSERT INTO question_messages (id, question_id, organization_id',
    'SELECT organization_id FROM user_questions',
    'count(DISTINCT active_user_orgs.organization_id) = 1',
  ]) {
    assertContains(files.messageThreads, messageThreads, needle);
  }

  for (const needle of [
    'organization_id = target.organization_id',
    'UPDATE conversation_messages AS child',
    'UPDATE user_questions AS child',
  ]) {
    assertContains(files.mergeConversation, mergeConversation, needle);
  }

  for (const needle of [
    'stamps question rows from conversation or identity organization context',
    'parent.organization_id, ti.organization_id)',
    'SELECT organization_id FROM conversations',
    'SELECT organization_id FROM user_questions',
  ]) {
    assertContains(files.messageThreadsTest, messageThreadsTest, needle);
  }
}

if (process.argv.includes('--self-test')) {
  const messageThreads = read(files.messageThreads).replace(
    'parent.organization_id, ti.organization_id)',
    'ti.organization_id)',
  );
  try {
    runChecks({ messageThreads });
  } catch {
    console.log('check-t0-4-integrator-transport-org self-test: OK');
    process.exit(0);
  }
  throw new Error('self-test did not detect missing parent organization fallback');
}

try {
  runChecks();
  console.log('check-t0-4-integrator-transport-org: OK');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-t0-4-integrator-transport-org: ${message}`);
  process.exit(1);
}
