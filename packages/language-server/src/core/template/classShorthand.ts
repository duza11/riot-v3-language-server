import {
  isIdentifierPart,
  isIdentifierStart,
  scanBalanced,
  scanJavaScriptNonCode,
} from '../scanners';

interface AttributeExpression {
  sourceOffset: number;
  text: string;
}

export function parseClassShorthandExpressions(
  text: string,
  sourceOffset: number,
): AttributeExpression[] {
  const expressions: AttributeExpression[] = [];
  let entryStart = 0;
  let foundShorthand = false;
  for (let offset = 0; offset <= text.length; ) {
    if (offset < text.length && text[offset] !== ',') {
      offset = scanClassShorthandToken(text, offset);
      continue;
    }

    const entry = parseClassShorthandEntry(
      text,
      entryStart,
      offset,
      sourceOffset,
    );
    if (!entry) {
      return [];
    }
    if (entry.kind === 'shorthand') {
      foundShorthand = true;
      expressions.push(entry.expression);
    }
    entryStart = offset + 1;
    offset++;
  }
  return foundShorthand ? expressions : [];
}

function scanClassShorthandToken(text: string, offset: number): number {
  const char = text[offset];
  const skipped = scanJavaScriptNonCode(text, offset);
  if (skipped !== undefined) {
    return skipped;
  }
  if (char === '(') {
    return scanBalanced(text, offset, '(', ')') ?? text.length;
  }
  if (char === '[') {
    return scanBalanced(text, offset, '[', ']') ?? text.length;
  }
  if (char === '{') {
    return scanBalanced(text, offset, '{', '}') ?? text.length;
  }
  return offset + 1;
}

function parseClassShorthandEntry(
  text: string,
  start: number,
  end: number,
  sourceOffset: number,
):
  | { kind: 'empty' }
  | { kind: 'shorthand'; expression: AttributeExpression }
  | undefined {
  const leadingWhitespace =
    text.slice(start, end).match(/^\s*/)?.[0].length ?? 0;
  const trailingWhitespace =
    text.slice(start, end).match(/\s*$/)?.[0].length ?? 0;
  const entryStart = start + leadingWhitespace;
  const entryEnd = end - trailingWhitespace;
  if (entryStart >= entryEnd) {
    return { kind: 'empty' };
  }

  const colon = findTopLevelColon(text, entryStart, entryEnd);
  if (colon === undefined) {
    return;
  }

  const key = text.slice(entryStart, colon).trim();
  if (!isValidClassShorthandKey(key)) {
    return;
  }
  const valueLeadingWhitespace =
    text.slice(colon + 1, entryEnd).match(/^\s*/)?.[0].length ?? 0;
  const valueStart = colon + 1 + valueLeadingWhitespace;
  if (valueStart >= entryEnd) {
    return;
  }
  return {
    kind: 'shorthand',
    expression: {
      sourceOffset: sourceOffset + valueStart,
      text: text.slice(valueStart, entryEnd),
    },
  };
}

function findTopLevelColon(
  text: string,
  start: number,
  end: number,
): number | undefined {
  for (let offset = start; offset < end; ) {
    const next = scanClassShorthandToken(text, offset);
    if (next !== offset + 1) {
      offset = next;
      continue;
    }
    if (text[offset] === ':') {
      return offset;
    }
    offset = next;
  }
}

function isValidClassShorthandKey(text: string): boolean {
  if (isValidIdentifier(text)) {
    return true;
  }
  if (
    (text[0] === "'" || text[0] === '"') &&
    text[text.length - 1] === text[0]
  ) {
    return true;
  }
  return /^[A-Za-z_-][\w-]*$/.test(text);
}

function isValidIdentifier(text: string): boolean {
  if (!isIdentifierStart(text[0] ?? '')) {
    return false;
  }
  for (let offset = 1; offset < text.length; offset++) {
    if (!isIdentifierPart(text[offset])) {
      return false;
    }
  }
  return true;
}
