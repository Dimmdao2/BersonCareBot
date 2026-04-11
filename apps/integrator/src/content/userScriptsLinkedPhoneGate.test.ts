/**
 * Регрессия контент-конфига: правила с match.context.linkedPhone === false не должны
 * отдавать WebApp-кнопки: ключ `webAppUrlFact` в сценариях или `web_app` в итоговой разметке Telegram.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadScriptArray(relPath: string): unknown[] {
  const raw = readFileSync(join(__dirname, relPath), 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected JSON array: ${relPath}`);
  }
  return parsed;
}

function matchHasLinkedPhoneFalse(match: unknown): boolean {
  if (match === null || typeof match !== 'object') return false;
  const ctx = (match as { context?: { linkedPhone?: unknown } }).context;
  return ctx?.linkedPhone === false;
}

function ruleHasNeedPhoneContext(rule: unknown): boolean {
  if (rule === null || typeof rule !== 'object') return false;
  const m = (rule as { match?: unknown }).match;
  return matchHasLinkedPhoneFalse(m);
}

function valueContainsBlockedWebAppKeys(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(valueContainsBlockedWebAppKeys);
  const o = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(o, 'webAppUrlFact')) return true;
  if (Object.prototype.hasOwnProperty.call(o, 'web_app')) return true;
  return Object.values(o).some(valueContainsBlockedWebAppKeys);
}

function collectViolations(rules: unknown[]): string[] {
  const out: string[] = [];
  for (const rule of rules) {
    if (!ruleHasNeedPhoneContext(rule)) continue;
    const steps = (rule as { id?: string; steps?: unknown }).steps;
    if (valueContainsBlockedWebAppKeys(steps)) {
      const id = typeof (rule as { id?: unknown }).id === 'string' ? (rule as { id: string }).id : '(no id)';
      out.push(id);
    }
  }
  return out;
}

describe('user scripts: linkedPhone false must not embed WebApp button keys', () => {
  it('telegram user/scripts.json', () => {
    const rules = loadScriptArray('telegram/user/scripts.json');
    expect(collectViolations(rules)).toEqual([]);
  });

  it('max user/scripts.json', () => {
    const rules = loadScriptArray('max/user/scripts.json');
    expect(collectViolations(rules)).toEqual([]);
  });
});
