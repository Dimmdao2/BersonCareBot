// Labels often append a section name to a real path (for example
// `apps/webapp/src/file.ts runtime branch`). Recognize the extension anywhere
// in that label so callers do not silently lose quote-style normalization.
const JAVASCRIPT_SOURCE_PATH = /\.[cm]?[jt]sx?\b/i;
const MARKDOWN_SOURCE_PATH = /\.md\b/i;
const SQL_SOURCE_PATH = /\.sql\b/i;
const SHELL_SOURCE_PATH = /\.(?:ba|z)?sh\b/i;

function decodeJavaScriptString(raw, quote) {
  let value = '';

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (character !== '\\') {
      value += character;
      continue;
    }

    const escaped = raw[index + 1];
    if (escaped === undefined) {
      value += '\\';
      continue;
    }
    index += 1;

    if (escaped === '\n') continue;
    if (escaped === '\r') {
      if (raw[index + 1] === '\n') index += 1;
      continue;
    }

    const simpleEscapes = {
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
      v: '\v',
      0: '\0',
      '\\': '\\',
      "'": "'",
      '"': '"',
    };
    if (Object.hasOwn(simpleEscapes, escaped)) {
      value += simpleEscapes[escaped];
      continue;
    }

    if (escaped === 'x' && /^[0-9a-fA-F]{2}$/.test(raw.slice(index + 1, index + 3))) {
      value += String.fromCodePoint(Number.parseInt(raw.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }

    if (escaped === 'u') {
      const braced = raw.slice(index + 1).match(/^\{([0-9a-fA-F]+)\}/);
      if (braced) {
        value += String.fromCodePoint(Number.parseInt(braced[1], 16));
        index += braced[0].length;
        continue;
      }

      const fixed = raw.slice(index + 1, index + 5);
      if (/^[0-9a-fA-F]{4}$/.test(fixed)) {
        value += String.fromCodePoint(Number.parseInt(fixed, 16));
        index += 4;
        continue;
      }
    }

    // JavaScript treats an otherwise unknown escape as the escaped character.
    // Keeping that runtime value makes quote-style normalization semantic.
    value += escaped === quote ? quote : escaped;
  }

  return value;
}

function readQuotedToken(
  source,
  start,
  quote,
  normalizeJavaScriptQuotes,
  doubledQuoteEscapes = false,
) {
  let raw = '';

  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === '\\') {
      raw += character;
      if (source[index + 1] !== undefined) {
        raw += source[index + 1];
        index += 1;
      }
      continue;
    }
    if (character === quote && doubledQuoteEscapes && source[index + 1] === quote) {
      raw += `${quote}${quote}`;
      index += 1;
      continue;
    }
    if (character === quote) {
      const value = normalizeJavaScriptQuotes ? decodeJavaScriptString(raw, quote) : raw;
      return {
        end: index + 1,
        token: normalizeJavaScriptQuotes
          ? `string:${JSON.stringify(value)}`
          : `quoted:${quote}${raw}${quote}`,
      };
    }
    raw += character;
  }

  return {
    end: source.length,
    token: `unterminated:${quote}${raw}`,
  };
}

function readCommentToken(source, start, lineComment, linePrefixLength = 2) {
  const closing = lineComment
    ? source.indexOf('\n', start + linePrefixLength)
    : source.indexOf('*/', start + 2);
  const end = closing < 0 ? source.length : closing + (lineComment ? 0 : 2);
  return {
    end,
    token: `comment:${source.slice(start, end)}`,
  };
}

function readTemplateToken(source, start) {
  let raw = '`';

  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    raw += character;
    if (character === '\\') {
      if (source[index + 1] !== undefined) {
        raw += source[index + 1];
        index += 1;
      }
      continue;
    }
    if (character === '`') {
      return { end: index + 1, token: `template:${raw}` };
    }
  }

  return { end: source.length, token: `unterminated-template:${raw}` };
}

function tokenizeSourceTextWithRanges(source, sourcePath = '') {
  const tokens = [];
  const normalizeJavaScriptQuotes = JAVASCRIPT_SOURCE_PATH.test(sourcePath);
  const markdownSource = MARKDOWN_SOURCE_PATH.test(sourcePath);
  const sqlSource = SQL_SOURCE_PATH.test(sourcePath);
  const shellSource = SHELL_SOURCE_PATH.test(sourcePath);

  for (let index = 0; index < source.length; ) {
    const character = source[index];
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }

    if (normalizeJavaScriptQuotes && character === '/' && source[index + 1] === '/') {
      const comment = readCommentToken(source, index, true);
      tokens.push({ value: comment.token, start: index, end: comment.end });
      index = comment.end;
      continue;
    }
    if (
      (normalizeJavaScriptQuotes || sqlSource) &&
      character === '/' &&
      source[index + 1] === '*'
    ) {
      const comment = readCommentToken(source, index, false);
      tokens.push({ value: comment.token, start: index, end: comment.end });
      index = comment.end;
      continue;
    }
    if (sqlSource && character === '-' && source[index + 1] === '-') {
      const comment = readCommentToken(source, index, true);
      tokens.push({ value: comment.token, start: index, end: comment.end });
      index = comment.end;
      continue;
    }
    if (
      shellSource &&
      character === '#' &&
      (index === 0 || source[index - 1] === '\n' || /\s/u.test(source[index - 1]))
    ) {
      const comment = readCommentToken(source, index, true, 1);
      tokens.push({ value: comment.token, start: index, end: comment.end });
      index = comment.end;
      continue;
    }

    if (markdownSource && character === '`') {
      index += 1;
      continue;
    }

    if (character === '`') {
      const template = readTemplateToken(source, index);
      tokens.push({ value: template.token, start: index, end: template.end });
      index = template.end;
      continue;
    }

    if (character === "'" || character === '"') {
      const quoted = readQuotedToken(
        source,
        index,
        character,
        normalizeJavaScriptQuotes,
        sqlSource,
      );
      tokens.push({ value: quoted.token, start: index, end: quoted.end });
      index = quoted.end;
      continue;
    }

    if (/[\p{L}\p{N}_$]/u.test(character)) {
      let end = index + 1;
      while (end < source.length && /[\p{L}\p{N}_$]/u.test(source[end])) end += 1;
      tokens.push({ value: `word:${source.slice(index, end)}`, start: index, end });
      index = end;
      continue;
    }

    tokens.push({ value: `symbol:${character}`, start: index, end: index + 1 });
    index += 1;
  }

  return tokens;
}

function tokenizeSourceText(source, sourcePath = '') {
  return tokenizeSourceTextWithRanges(source, sourcePath).map(({ value }) => value);
}

function findTokenSequence(sourceTokens, fragmentTokens, fromIndex = 0) {
  if (fragmentTokens.length === 0) return 0;

  const lastStart = sourceTokens.length - fragmentTokens.length;
  for (let start = Math.max(0, fromIndex); start <= lastStart; start += 1) {
    let matches = true;
    for (let offset = 0; offset < fragmentTokens.length; offset += 1) {
      if (sourceTokens[start + offset] !== fragmentTokens[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return start;
  }

  return -1;
}

function exactSubstringTokenIndex(source, fragment, sourceTokens, fromIndex = 0) {
  const minimumCharacterIndex = sourceTokens[fromIndex]?.start ?? 0;
  const characterIndex = source.indexOf(fragment, minimumCharacterIndex);
  if (characterIndex < 0) return -1;
  const tokenIndex = sourceTokens.findIndex(
    ({ start, end }) => characterIndex >= start && characterIndex < end,
  );
  return tokenIndex < 0 ? fromIndex : tokenIndex;
}

export function sourceTextIncludes(source, fragment, sourcePath = '') {
  const sourceTokens = tokenizeSourceTextWithRanges(source, sourcePath);
  const tokenMatch = findTokenSequence(
    sourceTokens.map(({ value }) => value),
    tokenizeSourceText(fragment, sourcePath),
  );
  // Existing gates intentionally pin diagnostic text by its bare contents,
  // without the surrounding JavaScript quote. Retain that exact-string case:
  // whitespace inside a literal remains semantic and is not normalized.
  return tokenMatch >= 0 || exactSubstringTokenIndex(source, fragment, sourceTokens) >= 0;
}

export function sourceTextIndexOf(source, fragment, sourcePath = '', fromIndex = 0) {
  const exactIndex = source.indexOf(fragment, fromIndex);
  if (exactIndex >= 0) return exactIndex;

  const sourceTokens = tokenizeSourceTextWithRanges(source, sourcePath);
  const fromTokenIndex = sourceTokens.findIndex(({ start }) => start >= fromIndex);
  const tokenMatch = findTokenSequence(
    sourceTokens.map(({ value }) => value),
    tokenizeSourceText(fragment, sourcePath),
    fromTokenIndex < 0 ? sourceTokens.length : fromTokenIndex,
  );
  return tokenMatch >= 0 ? sourceTokens[tokenMatch].start : -1;
}

export function sourceTextEquals(actual, expected, sourcePath = '') {
  const actualTokens = tokenizeSourceText(actual, sourcePath);
  const expectedTokens = tokenizeSourceText(expected, sourcePath);
  return (
    actualTokens.length === expectedTokens.length &&
    actualTokens.every((token, index) => token === expectedTokens[index])
  );
}

export function sourceTextSliceBetween(
  source,
  startFragment,
  endFragment,
  sourcePath = '',
  includeEnd = false,
) {
  const sourceTokens = tokenizeSourceTextWithRanges(source, sourcePath);
  const sourceValues = sourceTokens.map(({ value }) => value);
  const startTokens = tokenizeSourceText(startFragment, sourcePath);
  const endTokens = tokenizeSourceText(endFragment, sourcePath);
  const startTokenIndex = findTokenSequence(sourceValues, startTokens);
  if (startTokenIndex < 0) {
    const rawStart = source.indexOf(startFragment);
    if (rawStart < 0) return null;
    const rawEnd = source.indexOf(endFragment, rawStart + startFragment.length);
    if (rawEnd < 0) return null;
    return source.slice(rawStart, includeEnd ? rawEnd + endFragment.length : rawEnd);
  }

  const endTokenIndex = findTokenSequence(
    sourceValues,
    endTokens,
    startTokenIndex + Math.max(1, startTokens.length),
  );
  if (endTokenIndex < 0) {
    const rawEnd = source.indexOf(
      endFragment,
      sourceTokens[startTokenIndex + startTokens.length - 1].end,
    );
    if (rawEnd < 0) return null;
    return source.slice(
      sourceTokens[startTokenIndex].start,
      includeEnd ? rawEnd + endFragment.length : rawEnd,
    );
  }

  const endCharacterIndex = includeEnd
    ? sourceTokens[endTokenIndex + endTokens.length - 1].end
    : sourceTokens[endTokenIndex].start;
  return source.slice(sourceTokens[startTokenIndex].start, endCharacterIndex);
}

export function sourceTextSliceFrom(source, startFragment, sourcePath = '') {
  const sourceTokens = tokenizeSourceTextWithRanges(source, sourcePath);
  const sourceValues = sourceTokens.map(({ value }) => value);
  const startTokenIndex = findTokenSequence(
    sourceValues,
    tokenizeSourceText(startFragment, sourcePath),
  );
  if (startTokenIndex < 0) {
    const rawStart = source.indexOf(startFragment);
    return rawStart < 0 ? null : source.slice(rawStart);
  }
  return source.slice(sourceTokens[startTokenIndex].start);
}

export function sourceTextReplace(source, fragment, replacement, sourcePath = '') {
  const sourceTokens = tokenizeSourceTextWithRanges(source, sourcePath);
  const sourceValues = sourceTokens.map(({ value }) => value);
  const fragmentTokens = tokenizeSourceText(fragment, sourcePath);
  const tokenMatch = findTokenSequence(sourceValues, fragmentTokens);
  if (tokenMatch < 0) {
    const rawStart = source.indexOf(fragment);
    if (rawStart < 0) return source;
    return source.slice(0, rawStart) + replacement + source.slice(rawStart + fragment.length);
  }

  const start = sourceTokens[tokenMatch].start;
  const end = sourceTokens[tokenMatch + fragmentTokens.length - 1].end;
  return source.slice(0, start) + replacement + source.slice(end);
}
