import {
  isIdentifierPart,
  isIdentifierStart,
  scanBalanced,
  scanIdentifierEnd,
} from '../scanners';

export interface RiotV3MethodDefinition {
  nameStart: number;
  nameEnd: number;
  bodyStart: number;
  bodyEnd: number;
}

export function scanRiotV3MethodDefinition(
  text: string,
  nameStart: number,
): RiotV3MethodDefinition | undefined {
  const nameEnd = scanIdentifierEnd(text, nameStart);
  const name = text.slice(nameStart, nameEnd);
  if (scriptReservedWords.has(name) || name === 'function') {
    return;
  }

  let cursor = nameEnd;
  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor++;
  }
  if (text[cursor] !== '(') {
    return;
  }
  const paramsEnd = scanBalanced(text, cursor, '(', ')');
  if (paramsEnd === undefined) {
    return;
  }
  cursor = paramsEnd;
  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor++;
  }
  if (text[cursor] !== '{') {
    return;
  }
  const bodyEnd = scanBalanced(text, cursor, '{', '}');
  if (bodyEnd === undefined) {
    return;
  }
  return {
    nameStart,
    nameEnd,
    bodyStart: cursor + 1,
    bodyEnd,
  };
}

export function scanFunctionLikeEnd(
  text: string,
  start: number,
): number | undefined {
  if (
    !text.startsWith('function', start) ||
    isIdentifierPart(text[start - 1] ?? '') ||
    isIdentifierPart(text[start + 'function'.length] ?? '')
  ) {
    return;
  }

  let cursor = start + 'function'.length;
  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor++;
  }
  if (text[cursor] === '*') {
    cursor++;
    while (cursor < text.length && /\s/.test(text[cursor])) {
      cursor++;
    }
  }
  if (isIdentifierStart(text[cursor])) {
    cursor = scanIdentifierEnd(text, cursor);
    while (cursor < text.length && /\s/.test(text[cursor])) {
      cursor++;
    }
  }
  if (text[cursor] !== '(') {
    return;
  }
  const paramsEnd = scanBalanced(text, cursor, '(', ')');
  if (paramsEnd === undefined) {
    return;
  }
  cursor = paramsEnd;
  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor++;
  }
  if (text[cursor] !== '{') {
    return;
  }
  return scanBalanced(text, cursor, '{', '}');
}

export const riotV3TagInstanceMembers = new Set([
  'root',
  'opts',
  'refs',
  'tags',
  'parent',
  'isMounted',
  '_riot_id',
  'update',
  'mixin',
  'mount',
  'unmount',
  'on',
  'one',
  'off',
  'trigger',
]);

export const scriptReservedWords = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'let',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);
