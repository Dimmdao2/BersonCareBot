/**
 * Шаблонная подстановка `{{path.to.value}}` для params сценариев.
 * При сборке плана `values.*` может быть ещё пустым — такие плейсхолдеры сохраняются
 * и разрешаются в handleIncomingEvent перед каждым шагом.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getPathValue(source: unknown, path: string): unknown {
  const segments = path.split('.').filter((part) => part.length > 0);
  let current: unknown = source;
  for (const segment of segments) {
    if (!isRecord(current) && !Array.isArray(current)) return undefined;
    const index = Number(segment);
    if (Array.isArray(current) && Number.isInteger(index)) {
      current = current[index];
    } else if (isRecord(current)) {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

export type InterpolateTemplateOptions = {
  /** Keep `{{values.*}}` placeholders when path is missing (for runtime re-interpolation). */
  preserveUnresolvedValues?: boolean;
};

function shouldPreservePlaceholder(key: string, options?: InterpolateTemplateOptions): boolean {
  return options?.preserveUnresolvedValues === true && key.startsWith('values.');
}

export function interpolateTemplate(
  value: unknown,
  vars: Record<string, unknown>,
  options?: InterpolateTemplateOptions,
): unknown {
  if (typeof value === 'string') {
    const singlePlaceholder = value.match(/^\{\{\s*([\w.]+)\s*\}\}$/);
    if (singlePlaceholder) {
      const key = singlePlaceholder[1];
      if (typeof key !== 'string') return '';
      const replacement = getPathValue(vars, key);
      if (replacement === undefined) {
        return shouldPreservePlaceholder(key, options) ? value : '';
      }
      return replacement;
    }
    return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => {
      const replacement = getPathValue(vars, key);
      if (replacement === undefined) {
        return shouldPreservePlaceholder(key, options) ? match : '';
      }
      return typeof replacement === 'string' || typeof replacement === 'number'
        ? String(replacement)
        : '';
    });
  }
  if (Array.isArray(value)) return value.map((item) => interpolateTemplate(item, vars, options));
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = interpolateTemplate(v, vars, options);
    }
    return result;
  }
  return value;
}
