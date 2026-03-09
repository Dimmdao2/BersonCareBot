import type { ContentPort, TemplatePort } from '../../kernel/contracts/index.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getPathValue(source: unknown, path: string): unknown {
  const segments = path.split('.').filter((segment) => segment.length > 0);
  let current: unknown = source;

  for (const segment of segments) {
    if (!isRecord(current) && !Array.isArray(current)) return undefined;
    const index = Number(segment);
    if (Array.isArray(current) && Number.isInteger(index)) {
      current = current[index];
      continue;
    }
    if (isRecord(current)) {
      current = current[segment];
      continue;
    }
    return undefined;
  }

  return current;
}

/** Форматирует ISO-дату в ДД.ММ.ГГГГ в ЧЧ:ММ. */
function formatIsoDate(value: unknown): string {
  const s = typeof value === 'string' ? value.trim() : '';
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (isoMatch) {
    const [, y, m, d, h, min] = isoMatch;
    return `${d}.${m}.${y} в ${h}:${min}`;
  }
  const dateMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    const [, y, m, d] = dateMatch;
    return `${d}.${m}.${y}`;
  }
  return s || '';
}

function formatReplacement(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return formatIsoDate(value);
    if (value === 'created' || value === 'updated') return 'Записан';
    if (value === 'canceled') return 'Отменена';
    return value;
  }
  if (typeof value === 'number') return String(value);
  return '';
}

function interpolateTemplate(text: string, vars: Record<string, unknown>): string {
  const eachBlock = /\{\{\s*#each\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\s*\/each\s*\}\}/g;
  let result = text.replace(eachBlock, (_, path, block) => {
    const arr = getPathValue(vars, path);
    if (!Array.isArray(arr)) return '';
    return arr
      .map((item) => {
        const itemVars = isRecord(item) ? { ...vars, item: item as Record<string, unknown> } : vars;
        return interpolateTemplate(block, itemVars);
      })
      .join('');
  });

  result = result.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const replacement = getPathValue(vars, key);
    return formatReplacement(replacement);
  });

  return result;
}

export function createTemplatePort(input: { contentPort: ContentPort }): TemplatePort {
  return {
    async renderTemplate({ source, templateId, vars = {}, audience }): Promise<{ text: string }> {
      const template = audience !== undefined
        ? await input.contentPort.getTemplate({ source, audience }, templateId)
        : (input.contentPort.getTemplateByKey
          ? await input.contentPort.getTemplateByKey(`${source}:${templateId}`)
          : null);
      if (!template || typeof template.text !== 'string') return { text: '' };
      return { text: interpolateTemplate(template.text, vars) };
    },
  };
}