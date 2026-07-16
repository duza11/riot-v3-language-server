import { findPreviousNonWhitespace } from '../scanners';

export function shouldMaskTemplateIdentifier(
  text: string,
  offset: number,
  identifier: string,
  inEachScope: boolean,
): boolean {
  if (inEachScope && identifier === 'parent') {
    return false;
  }
  if (!templateExcludedInstanceMembers.has(identifier)) {
    return false;
  }
  const previous = findPreviousNonWhitespace(text, offset - 1);
  return previous !== '.';
}

export function shouldPrefixTemplateIdentifier(
  text: string,
  offset: number,
  identifier: string,
): boolean {
  if (
    identifier === 'this' ||
    templateGlobals.has(identifier) ||
    templateReservedWords.has(identifier)
  ) {
    return false;
  }

  const previous = findPreviousNonWhitespace(text, offset - 1);
  if (previous === '.') {
    return false;
  }

  return true;
}

const templateGlobals = new Set([
  'Array',
  'Boolean',
  'Date',
  'JSON',
  'Math',
  'Number',
  'Object',
  'RegExp',
  'String',
  'console',
  'undefined',
  'NaN',
  'Infinity',
  'riot',
]);

const templateExcludedInstanceMembers = new Set([
  'root',
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

const templateReservedWords = new Set([
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
