export function scanIdentifierEnd(text: string, start: number): number {
  let offset = start + 1;
  while (offset < text.length && isIdentifierPart(text[offset])) {
    offset++;
  }
  return offset;
}

export function scanBalanced(
  text: string,
  start: number,
  open: string,
  close: string,
): number | undefined {
  let depth = 0;
  for (let offset = start; offset < text.length; ) {
    const char = text[offset];
    const skipped = scanJavaScriptNonCode(text, offset);
    if (skipped !== undefined) {
      offset = skipped;
      continue;
    }
    if (char === open) {
      depth++;
    } else if (char === close) {
      depth--;
      if (depth === 0) {
        return offset + 1;
      }
    }
    offset++;
  }
}

export function scanTemplateNonIdentifier(text: string, start: number): number {
  return scanJavaScriptNonCode(text, start) ?? start + 1;
}

export function scanJavaScriptNonCode(
  text: string,
  start: number,
): number | undefined {
  const char = text[start];
  if (char === "'" || char === '"' || char === '`') {
    return scanString(text, start);
  }
  if (char !== '/') {
    return;
  }
  if (text[start + 1] === '/' || text[start + 1] === '*') {
    return scanComment(text, start);
  }
  return scanRegularExpression(text, start);
}

export function scanRegularExpression(
  text: string,
  start: number,
): number | undefined {
  if (text[start] !== '/' || !canStartRegularExpression(text, start)) {
    return;
  }

  let inCharacterClass = false;
  for (let offset = start + 1; offset < text.length; offset++) {
    const char = text[offset];
    if (char === '\\') {
      offset++;
      continue;
    }
    if (char === '\n' || char === '\r') {
      return;
    }
    if (char === '[') {
      inCharacterClass = true;
      continue;
    }
    if (char === ']' && inCharacterClass) {
      inCharacterClass = false;
      continue;
    }
    if (char === '/' && !inCharacterClass) {
      let end = offset + 1;
      while (/[A-Za-z]/.test(text[end] ?? '')) {
        end++;
      }
      return end;
    }
  }
}

function canStartRegularExpression(text: string, start: number): boolean {
  let cursor = start - 1;
  while (cursor >= 0 && /\s/.test(text[cursor])) {
    cursor--;
  }
  if (cursor < 0) {
    return true;
  }

  const previous = text[cursor];
  if (/[$\w]/.test(previous)) {
    let wordStart = cursor;
    while (wordStart > 0 && /[$\w]/.test(text[wordStart - 1])) {
      wordStart--;
    }
    return regularExpressionPrefixKeywords.has(
      text.slice(wordStart, cursor + 1),
    );
  }

  if (
    previous === ')' ||
    previous === ']' ||
    previous === '}' ||
    previous === "'" ||
    previous === '"' ||
    previous === '`'
  ) {
    return false;
  }
  if ((previous === '+' || previous === '-') && text[cursor - 1] === previous) {
    return false;
  }
  return true;
}

const regularExpressionPrefixKeywords = new Set([
  'await',
  'case',
  'delete',
  'do',
  'else',
  'in',
  'instanceof',
  'of',
  'return',
  'throw',
  'typeof',
  'void',
  'yield',
]);

export function scanString(text: string, start: number): number {
  const quote = text[start];
  for (let offset = start + 1; offset < text.length; offset++) {
    if (text[offset] === '\\') {
      offset++;
      continue;
    }
    if (text[offset] === quote) {
      return offset + 1;
    }
  }
  return text.length;
}

export function scanComment(text: string, start: number): number {
  if (text[start + 1] === '/') {
    const end = text.indexOf('\n', start + 2);
    return end === -1 ? text.length : end;
  }
  const end = text.indexOf('*/', start + 2);
  return end === -1 ? text.length : end + 2;
}

export function isInRanges(
  offset: number,
  ranges: { start: number; end: number }[],
): boolean {
  return ranges.some((range) => offset >= range.start && offset < range.end);
}

export function isIdentifierStart(char: string): boolean {
  return /[$A-Z_a-z]/.test(char);
}

export function isIdentifierPart(char: string): boolean {
  return /[$\w]/.test(char);
}

export function findPreviousNonWhitespace(
  text: string,
  offset: number,
): string | undefined {
  for (let cursor = offset; cursor >= 0; cursor--) {
    if (!/\s/.test(text[cursor])) {
      return text[cursor];
    }
  }
}
