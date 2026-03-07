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

function interpolateTemplate(text: string, vars: Record<string, unknown>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const replacement = getPathValue(vars, key);
    if (typeof replacement === 'string' || typeof replacement === 'number') return String(replacement);
    return '';
  });
}

export function createTemplatePort(input: { contentPort: ContentPort }): TemplatePort {
  return {
    async renderTemplate({ source, templateId, vars = {} }): Promise<{ text: string }> {
      const template = await input.contentPort.getTemplate(`${source}:${templateId}`);
      if (!template || typeof template.text !== 'string') return { text: '' };
      return { text: interpolateTemplate(template.text, vars) };
    },
  };
}