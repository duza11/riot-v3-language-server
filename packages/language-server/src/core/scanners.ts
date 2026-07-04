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
    if (char === "'" || char === '"' || char === '`') {
      offset = scanString(text, offset);
      continue;
    }
    if (
      char === '/' &&
      (text[offset + 1] === '/' || text[offset + 1] === '*')
    ) {
      offset = scanComment(text, offset);
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
  const char = text[start];
  if (char === "'" || char === '"' || char === '`') {
    return scanString(text, start);
  }
  if (char === '/' && (text[start + 1] === '/' || text[start + 1] === '*')) {
    return scanComment(text, start);
  }
  return start + 1;
}

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
