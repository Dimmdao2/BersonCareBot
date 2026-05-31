import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildScriptInterpolationVars } from './scriptVars.js';
import type { BaseContext, IncomingEvent } from '../contracts/index.js';

const contentRoot = fileURLToPath(new URL('../../content/', import.meta.url));

type ScriptStep = { action: string; params?: Record<string, unknown> };

async function readAdminScripts(source: 'telegram' | 'max'): Promise<Array<{ id: string; steps: ScriptStep[] }>> {
  const filePath = path.join(contentRoot, source, 'admin', 'scripts.json');
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as Array<{ id: string; steps: ScriptStep[] }>;
}

function adminProgramReplyEvent(source: 'telegram' | 'max'): IncomingEvent {
  return {
    type: 'callback.received',
    meta: {
      eventId: `evt-pn-${source}`,
      occurredAt: '2026-05-31T12:00:00.000Z',
      source,
      userId: '9001',
    },
    payload: {
      incoming: {
        kind: 'callback',
        action: 'program_reply',
        stageItemId: 'stage-99',
        chatId: 9001,
        channelUserId: 9001,
        callbackQueryId: 'cq-flow',
      },
    },
  };
}

describe('program note reply flow', () => {
  const baseContext: BaseContext = {
    actor: { isAdmin: true },
    identityLinks: [],
  };

  it.each(['telegram', 'max'] as const)(
    '%s admin programNote script has replyBegin without values.* state step',
    async (source) => {
      const scripts = await readAdminScripts(source);
      const script = scripts.find((s) => s.id === `${source}.admin.programNote.reply.start`);
      expect(script).toBeDefined();
      const actions = script!.steps.map((s) => s.action);
      expect(actions).toEqual([
        'webapp.programNote.replyBegin',
        'message.send',
        'callback.answer',
      ]);
      expect(JSON.stringify(script)).not.toContain('values.programNoteReplyState');
    },
  );

  it('buildScriptInterpolationVars exposes program_reply match fields for routing', () => {
    const vars = buildScriptInterpolationVars({
      event: adminProgramReplyEvent('telegram'),
      context: baseContext,
    });
    expect(vars.input).toMatchObject({
      action: 'program_reply',
      stageItemId: 'stage-99',
    });
    expect(vars.actor).toMatchObject({ isAdmin: true, channelUserId: 9001, chatId: 9001 });
  });
});
