const skipQuoted = (text, start) => {
  const quote = text[start];
  if (quote === "'" || quote === '"') {
    let cursor = start + 1;
    while (cursor < text.length) {
      if (text[cursor] === quote && text[cursor + 1] === quote) { cursor += 2; continue; }
      if (text[cursor] === quote) return cursor + 1;
      cursor += 1;
    }
    return text.length;
  }
  if (text.startsWith('--', start)) {
    const end = text.indexOf('\n', start + 2);
    return end < 0 ? text.length : end + 1;
  }
  if (text.startsWith('/*', start)) {
    const end = text.indexOf('*/', start + 2);
    return end < 0 ? text.length : end + 2;
  }
  const dollar = text.slice(start).match(/^\$[a-zA-Z_0-9]*\$/u)?.[0];
  if (dollar) {
    const end = text.indexOf(dollar, start + dollar.length);
    return end < 0 ? text.length : end + dollar.length;
  }
  return start + 1;
};

const matchingParen = (text, open) => {
  let depth = 0;
  for (let cursor = open; cursor < text.length; cursor += 1) {
    if (text[cursor] === "'" || text[cursor] === '"' || text.startsWith('--', cursor)
        || text.startsWith('/*', cursor) || /^\$[a-zA-Z_0-9]*\$/u.test(text.slice(cursor))) {
      cursor = skipQuoted(text, cursor) - 1;
      continue;
    }
    if (text[cursor] === '(') depth += 1;
    if (text[cursor] === ')') {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  throw new Error(`unclosed parenthesis at byte ${open}`);
};

const splitTopLevel = (text) => {
  const rows = [];
  let start = 0;
  let depth = 0;
  for (let cursor = 0; cursor < text.length; cursor += 1) {
    if (text[cursor] === "'" || text[cursor] === '"' || text.startsWith('--', cursor)
        || text.startsWith('/*', cursor) || /^\$[a-zA-Z_0-9]*\$/u.test(text.slice(cursor))) {
      cursor = skipQuoted(text, cursor) - 1;
      continue;
    }
    if (text[cursor] === '(' || text[cursor] === '[') depth += 1;
    if (text[cursor] === ')' || text[cursor] === ']') depth -= 1;
    if (text[cursor] === ',' && depth === 0) {
      rows.push(text.slice(start, cursor).trim());
      start = cursor + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) rows.push(tail);
  return rows;
};

const normalizeType = (raw) => {
  let value = raw.trim()
    .replace(/\s+/gu, ' ')
    .replace(/\s*\[\s*\]/gu, '[]')
    .replace(/\([^()]*(?:\([^()]*\)[^()]*)*\)$/u, '')
    .replace(/^pg_catalog\./u, '')
    .toLowerCase();
  const array = value.endsWith('[]');
  if (array) value = value.slice(0, -2);
  const aliases = new Map([
    ['bool', 'boolean'], ['int2', 'smallint'], ['int4', 'integer'], ['int', 'integer'],
    ['int8', 'bigint'], ['float4', 'real'], ['float8', 'double precision'],
    ['decimal', 'numeric'], ['varchar', 'character varying'], ['char', 'character'],
    ['timestamptz', 'timestamp with time zone'], ['timestamp', 'timestamp without time zone'],
    ['timetz', 'time with time zone'], ['time', 'time without time zone'],
  ]);
  value = aliases.get(value) ?? value;
  if (value.startsWith('public.')) value = value.slice('public.'.length);
  return `${value}${array ? '[]' : ''}`;
};

const stripDefault = (argument) => {
  let depth = 0;
  for (let cursor = 0; cursor < argument.length; cursor += 1) {
    if (argument[cursor] === "'" || argument[cursor] === '"') {
      cursor = skipQuoted(argument, cursor) - 1;
      continue;
    }
    if (argument[cursor] === '(' || argument[cursor] === '[') depth += 1;
    if (argument[cursor] === ')' || argument[cursor] === ']') depth -= 1;
    if (depth === 0 && argument[cursor] === '=') return argument.slice(0, cursor).trim();
    if (depth === 0 && /^\sdefault\b/iu.test(argument.slice(cursor))) return argument.slice(0, cursor).trim();
  }
  return argument.trim();
};

const parameterModeAndType = (argument) => {
  const clean = stripDefault(argument);
  const modeMatch = clean.match(/^\s*(INOUT|OUT|IN|VARIADIC)\b\s*/iu);
  const mode = modeMatch?.[1].toUpperCase() ?? 'IN';
  let remainder = clean.slice(modeMatch?.[0].length ?? 0).trim();
  const pieces = remainder.match(/^("(?:[^"]|"")*"|[a-zA-Z_][\w$]*)\s+([\s\S]+)$/u);
  if (pieces) remainder = pieces[2];
  return { mode, type: normalizeType(remainder) };
};

const tableColumnType = (column) => {
  const pieces = column.trim().match(/^("(?:[^"]|"")*"|[a-zA-Z_][\w$]*)\s+([\s\S]+)$/u);
  if (!pieces) throw new Error(`cannot parse RETURNS TABLE column: ${column}`);
  return normalizeType(pieces[2]);
};

const ATTRIBUTE_START = /\b(?:LANGUAGE|TRANSFORM|WINDOW|IMMUTABLE|STABLE|VOLATILE|CALLED|RETURNS\s+NULL|STRICT|SECURITY|LEAKPROOF|NOT\s+LEAKPROOF|PARALLEL|COST|ROWS|SUPPORT|SET|AS)\b/iu;

export function parseReturnShape(args, afterArgs) {
  const table = afterArgs.match(/^\s*RETURNS\s+TABLE\s*\(/iu);
  if (table) {
    const open = afterArgs.indexOf('(', table.index ?? 0);
    const close = matchingParen(afterArgs, open);
    const columns = splitTopLevel(afterArgs.slice(open + 1, close)).map(tableColumnType);
    if (columns.length === 0) throw new Error('RETURNS TABLE without columns');
    return { returns: columns.length === 1 ? columns[0] : 'record', returnsSet: true, form: 'TABLE' };
  }
  const setof = afterArgs.match(/^\s*RETURNS\s+SETOF\s+([\s\S]+)$/iu);
  if (setof) {
    const end = setof[1].search(ATTRIBUTE_START);
    return { returns: normalizeType(end < 0 ? setof[1] : setof[1].slice(0, end)), returnsSet: true, form: 'SETOF' };
  }
  const scalar = afterArgs.match(/^\s*RETURNS\s+([\s\S]+)$/iu);
  if (scalar) {
    const end = scalar[1].search(ATTRIBUTE_START);
    return { returns: normalizeType(end < 0 ? scalar[1] : scalar[1].slice(0, end)), returnsSet: false, form: 'SCALAR' };
  }
  const outs = splitTopLevel(args).map(parameterModeAndType).filter((row) => row.mode === 'OUT' || row.mode === 'INOUT');
  if (outs.length === 0) throw new Error(`function has neither RETURNS nor OUT arguments: ${afterArgs.slice(0, 120)}`);
  return { returns: outs.length === 1 ? outs[0].type : 'record', returnsSet: false, form: 'OUT' };
}

export function extractFunctionReturnShapes(source, text) {
  const definitions = [];
  let executable = '';
  let cursor = 0;
  while (cursor < text.length) {
    if (text[cursor] === "'" || text[cursor] === '"' || text.startsWith('--', cursor)
        || text.startsWith('/*', cursor) || /^\$[a-zA-Z_0-9]*\$/u.test(text.slice(cursor))) {
      const end = skipQuoted(text, cursor);
      executable += ' '.repeat(end - cursor);
      cursor = end;
      continue;
    }
    executable += text[cursor];
    cursor += 1;
  }
  const pattern = /CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+([a-zA-Z_][\w$]*\.[a-zA-Z_][\w$]*)\s*\(/gimu;
  for (const match of executable.matchAll(pattern)) {
    const open = (match.index ?? 0) + match[0].lastIndexOf('(');
    const close = matchingParen(text, open);
    const args = text.slice(open + 1, close);
    const afterArgs = text.slice(close + 1);
    const asMatch = afterArgs.match(/\bAS\s+\$[a-zA-Z_0-9]*\$/iu);
    if (!asMatch || asMatch.index === undefined) throw new Error(`no AS dollar quote for ${match[1]} in ${source}`);
    definitions.push({ name: match[1].toLowerCase(), source, ...parseReturnShape(args, afterArgs.slice(0, asMatch.index)) });
  }
  return definitions;
}

function extractDroppedFunctionNames(text) {
  let executable = '';
  let cursor = 0;
  while (cursor < text.length) {
    if (text[cursor] === "'" || text[cursor] === '"' || text.startsWith('--', cursor)
        || text.startsWith('/*', cursor) || /^\$[a-zA-Z_0-9]*\$/u.test(text.slice(cursor))) {
      const end = skipQuoted(text, cursor);
      executable += ' '.repeat(end - cursor);
      cursor = end;
      continue;
    }
    executable += text[cursor];
    cursor += 1;
  }
  return [...executable.matchAll(
    /DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?([a-zA-Z_][\w$]*\.[a-zA-Z_][\w$]*)\s*\(/gimu,
  )].map((match) => match[1].toLowerCase());
}

export function latestFunctionReturnShapes(sources) {
  const byName = new Map();
  for (const { source, text } of sources) {
    const definitions = extractFunctionReturnShapes(source, text);
    const definedNames = new Set(definitions.map((row) => row.name));
    for (const row of definitions) byName.set(row.name, row);
    for (const name of extractDroppedFunctionNames(text)) {
      if (!definedNames.has(name)) byName.delete(name);
    }
  }
  return byName;
}

export function compareDeclaredFunctionReturnShapes(declaredFunctions, canonicalByName, externalShapes = {}) {
  const gaps = [];
  for (const [signature, declared] of Object.entries(declaredFunctions)) {
    const name = signature.slice(0, signature.indexOf('('));
    const actual = canonicalByName.get(name) ?? externalShapes[signature];
    if (!actual) { gaps.push(`${signature}: canonical return shape is absent`); continue; }
    if (declared.returns !== actual.returns || declared.returnsSet !== actual.returnsSet) {
      gaps.push(`${signature}: actual=${actual.returns}/${actual.returnsSet ? 'set' : 'scalar'} declared=${declared.returns}/${declared.returnsSet ? 'set' : 'scalar'}`);
    }
  }
  return gaps.sort();
}
