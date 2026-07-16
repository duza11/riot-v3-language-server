import type * as ts from 'typescript';
import {
  isIdentifierPart,
  isIdentifierStart,
  scanBalanced,
  scanIdentifierEnd,
  scanJavaScriptNonCode,
} from '../scanners';
import type { ScriptBlock, ScriptProperty } from '../types';
import { findPrecedingJSDoc, inferJSDocRiotMethodType } from './jsdoc';
import {
  riotV3TagInstanceMembers,
  scanFunctionLikeEnd,
  scanRiotV3MethodDefinition,
  scriptReservedWords,
} from './syntax';
import {
  createScriptPropertyFromAssignment,
  inferAssignedPropertyTypeIfAssigned,
  isNumberLiteral,
  isValidIdentifier,
  mergeScriptProperty,
} from './typeInference';
import type { ScriptPropertyAssignment } from './types';

const dynamicStringIndexProperty = '[key: string]';

export function getScriptProperties(
  snapshot: ts.IScriptSnapshot,
  scripts: ScriptBlock[],
): ScriptProperty[] {
  const properties = new Map<string, ScriptProperty>();
  const aliases = getScriptThisAliases(snapshot, scripts);
  for (const script of scripts) {
    const text = snapshot.getText(script.start, script.end);
    for (const property of [
      ...scanInstanceProperties(text, script.start, aliases),
      ...scanRiotV3MethodProperties(text, script.start),
    ]) {
      const existing = properties.get(property.name);
      properties.set(property.name, mergeScriptProperty(existing, property));
    }
  }
  return [...properties.values()];
}

export function getScriptThisAliases(
  snapshot: ts.IScriptSnapshot,
  scripts: ScriptBlock[],
): string[] {
  const aliases: string[] = [];
  for (const script of scripts) {
    for (const alias of getThisAliases(
      snapshot.getText(script.start, script.end),
    )) {
      if (!aliases.includes(alias)) {
        aliases.push(alias);
      }
    }
  }
  return aliases;
}

function scanInstanceProperties(
  text: string,
  sourceOffset: number,
  sharedAliases: string[] = [],
): ScriptProperty[] {
  const properties = new Map<string, ScriptProperty>();
  for (const assignment of scanInstancePropertyAssignments(
    text,
    sourceOffset,
    sharedAliases,
  )) {
    const property = createScriptPropertyFromAssignment(assignment);
    properties.set(
      property.name,
      mergeScriptProperty(properties.get(property.name), property),
    );
  }
  return [...properties.values()];
}

export function scanInstancePropertyOccurrences(
  text: string,
  sourceOffset: number,
  sharedAliases: string[] = [],
): Pick<ScriptProperty, 'name' | 'sourceOffset'>[] {
  const aliases = getCombinedThisAliases(text, sharedAliases);
  const owners = ['this', ...aliases].sort(
    (left, right) => right.length - left.length,
  );
  const occurrences: Pick<ScriptProperty, 'name' | 'sourceOffset'>[] = [];

  for (let offset = 0; offset < text.length; ) {
    const skipped = scanJavaScriptNonCode(text, offset);
    if (skipped !== undefined) {
      offset = skipped;
      continue;
    }
    const owner = owners.find(
      (candidate) =>
        text.startsWith(candidate, offset) &&
        !isIdentifierPart(text[offset - 1] ?? '') &&
        !isIdentifierPart(text[offset + candidate.length] ?? ''),
    );
    if (!owner) {
      offset++;
      continue;
    }
    const chain = scanPropertyPath(text, offset + owner.length);
    const name = chain?.path[0];
    if (
      chain &&
      name !== undefined &&
      name !== dynamicStringIndexProperty &&
      !scriptReservedWords.has(name) &&
      !riotV3TagInstanceMembers.has(name)
    ) {
      occurrences.push({
        name,
        sourceOffset: sourceOffset + chain.nameStart,
      });
    }
    offset += owner.length;
  }

  return occurrences;
}

function scanInstancePropertyAssignments(
  text: string,
  sourceOffset: number,
  sharedAliases: string[] = [],
): ScriptPropertyAssignment[] {
  const aliases = getCombinedThisAliases(text, sharedAliases);
  const properties = scanThisPropertyAssignments(text, sourceOffset);
  for (const alias of aliases) {
    properties.push(...scanAliasPropertyAssignments(text, sourceOffset, alias));
  }
  return properties;
}

function getCombinedThisAliases(
  text: string,
  sharedAliases: string[],
): string[] {
  return [...new Set([...sharedAliases, ...getThisAliases(text)])];
}

export function scanRiotV3MethodProperties(
  text: string,
  sourceOffset: number,
): ScriptProperty[] {
  const properties: ScriptProperty[] = [];
  let offset = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;

  while (offset < text.length) {
    const char = text[offset];
    const skipped = scanJavaScriptNonCode(text, offset);
    if (skipped !== undefined) {
      offset = skipped;
      continue;
    }
    if (
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      isIdentifierStart(char)
    ) {
      const functionEnd = scanFunctionLikeEnd(text, offset);
      if (functionEnd !== undefined) {
        offset = functionEnd;
        continue;
      }
      const method = scanRiotV3MethodDefinition(text, offset);
      if (method) {
        const name = text.slice(method.nameStart, method.nameEnd);
        if (!riotV3TagInstanceMembers.has(name)) {
          const jsDocType = inferJSDocRiotMethodType(
            text,
            method.nameEnd,
            findPrecedingJSDoc(text, method.nameStart),
          );
          properties.push({
            name,
            sourceOffset: sourceOffset + method.nameStart,
            typeName: jsDocType ?? '(...args: any[]) => any',
            assignmentKind: 'replacement',
            typeOrigin: jsDocType ? 'explicit' : 'inferred',
          });
        }
        offset = method.bodyEnd;
        continue;
      }
      offset = scanIdentifierEnd(text, offset);
      continue;
    }

    if (char === '(') {
      parenDepth++;
    } else if (char === ')') {
      parenDepth--;
    } else if (char === '[') {
      bracketDepth++;
    } else if (char === ']') {
      bracketDepth--;
    } else if (char === '{') {
      braceDepth++;
    } else if (char === '}') {
      braceDepth--;
    }
    offset++;
  }

  return properties;
}

export function getComponentScriptLanguageId(
  scripts: ScriptBlock[],
): ScriptBlock['languageId'] {
  return (
    scripts.find((script) => script.languageId !== 'javascript')?.languageId ??
    'javascript'
  );
}

function scanThisPropertyAssignments(
  text: string,
  sourceOffset: number,
): ScriptPropertyAssignment[] {
  const properties: ScriptPropertyAssignment[] = [];
  for (let offset = 0; offset < text.length; ) {
    const skipped = scanJavaScriptNonCode(text, offset);
    if (skipped !== undefined) {
      offset = skipped;
      continue;
    }
    if (
      text.startsWith('this', offset) &&
      !isIdentifierPart(text[offset - 1] ?? '') &&
      !isIdentifierPart(text[offset + 4] ?? '')
    ) {
      const property = scanOwnerPropertyAssignment(
        text,
        offset,
        sourceOffset,
        'this',
      );
      if (property) {
        properties.push(property);
        offset = property.sourceOffset - sourceOffset + property.path[0].length;
        continue;
      }
    }
    offset++;
  }
  return properties;
}

function scanAliasPropertyAssignments(
  text: string,
  sourceOffset: number,
  alias: string,
): ScriptPropertyAssignment[] {
  const properties: ScriptPropertyAssignment[] = [];
  for (let offset = 0; offset < text.length; ) {
    const skipped = scanJavaScriptNonCode(text, offset);
    if (skipped !== undefined) {
      offset = skipped;
      continue;
    }
    if (
      text.startsWith(alias, offset) &&
      !isIdentifierPart(text[offset - 1] ?? '') &&
      !isIdentifierPart(text[offset + alias.length] ?? '')
    ) {
      const property = scanOwnerPropertyAssignment(
        text,
        offset,
        sourceOffset,
        alias,
      );
      if (property) {
        properties.push(property);
        offset = property.sourceOffset - sourceOffset + property.path[0].length;
        continue;
      }
    }
    offset++;
  }
  return properties;
}

function scanOwnerPropertyAssignment(
  text: string,
  ownerOffset: number,
  sourceOffset: number,
  owner: string,
): ScriptPropertyAssignment | undefined {
  const chain = scanPropertyPath(text, ownerOffset + owner.length);
  if (!chain) {
    return;
  }
  const rootName = chain.path[0];
  if (
    scriptReservedWords.has(rootName) ||
    riotV3TagInstanceMembers.has(rootName)
  ) {
    return;
  }
  const assignedType = inferAssignedPropertyTypeIfAssigned(
    text,
    chain.end,
    findPrecedingJSDoc(text, ownerOffset),
  );
  if (!assignedType && chain.path.length > 1) {
    return;
  }
  return {
    path: chain.path,
    sourceOffset: sourceOffset + chain.nameStart,
    typeName:
      assignedType && !chain.path.includes(dynamicStringIndexProperty)
        ? assignedType.typeName
        : 'any',
    typeOrigin: assignedType?.typeOrigin ?? 'inferred',
  };
}

function getThisAliases(text: string): string[] {
  const aliases: string[] = [];
  for (let offset = 0; offset < text.length; ) {
    const skipped = scanJavaScriptNonCode(text, offset);
    if (skipped !== undefined) {
      offset = skipped;
      continue;
    }
    const alias = scanThisAlias(text, offset);
    if (alias) {
      if (!aliases.includes(alias.name)) {
        aliases.push(alias.name);
      }
      offset = alias.end;
      continue;
    }
    offset++;
  }
  return aliases;
}

function scanThisAlias(
  text: string,
  start: number,
): { name: string; end: number } | undefined {
  const keyword = getDeclarationKeywordAt(text, start);
  let cursor = start;
  if (keyword) {
    cursor += keyword.length;
    if (!/\s/.test(text[cursor] ?? '')) {
      return;
    }
    while (cursor < text.length && /\s/.test(text[cursor])) {
      cursor++;
    }
  } else if (
    !isIdentifierStart(text[cursor]) ||
    isIdentifierPart(text[cursor - 1] ?? '')
  ) {
    return;
  }
  if (!isIdentifierStart(text[cursor])) {
    return;
  }
  const nameStart = cursor;
  cursor++;
  while (cursor < text.length && isIdentifierPart(text[cursor])) {
    cursor++;
  }
  const name = text.slice(nameStart, cursor);
  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor++;
  }
  if (text[cursor] !== '=') {
    return;
  }
  cursor++;
  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor++;
  }
  if (
    !text.startsWith('this', cursor) ||
    isIdentifierPart(text[cursor + 'this'.length] ?? '') ||
    text[cursor + 'this'.length] === '.'
  ) {
    return;
  }
  return {
    name,
    end: cursor + 'this'.length,
  };
}

function getDeclarationKeywordAt(
  text: string,
  offset: number,
): 'const' | 'let' | 'var' | undefined {
  for (const keyword of ['const', 'let', 'var'] as const) {
    if (
      text.startsWith(keyword, offset) &&
      !isIdentifierPart(text[offset - 1] ?? '') &&
      !isIdentifierPart(text[offset + keyword.length] ?? '')
    ) {
      return keyword;
    }
  }
}

function scanPropertyPath(
  text: string,
  start: number,
): { path: string[]; nameStart: number; end: number } | undefined {
  const path: string[] = [];
  let cursor = start;
  let nameStart: number | undefined;
  for (;;) {
    while (cursor < text.length && /\s/.test(text[cursor])) {
      cursor++;
    }
    if (text[cursor] === '.') {
      const property = scanDotPropertyPathPart(text, cursor);
      if (!property) {
        break;
      }
      nameStart ??= property.nameStart;
      path.push(property.name);
      cursor = property.end;
      continue;
    }
    if (text[cursor] === '[') {
      const property = scanBracketPropertyPathPart(text, cursor);
      if (!property) {
        break;
      }
      nameStart ??= property.nameStart;
      path.push(property.name);
      cursor = property.end;
      continue;
    }
    break;
  }
  return path.length && nameStart !== undefined
    ? { path, nameStart, end: cursor }
    : undefined;
}

function scanDotPropertyPathPart(
  text: string,
  start: number,
): { name: string; nameStart: number; end: number } | undefined {
  let cursor = start + 1;
  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor++;
  }
  if (!isIdentifierStart(text[cursor])) {
    return;
  }
  const nameStart = cursor;
  cursor++;
  while (cursor < text.length && isIdentifierPart(text[cursor])) {
    cursor++;
  }
  return {
    name: text.slice(nameStart, cursor),
    nameStart,
    end: cursor,
  };
}

function scanBracketPropertyPathPart(
  text: string,
  start: number,
): { name: string; nameStart: number; end: number } | undefined {
  const end = scanBalanced(text, start, '[', ']');
  if (end === undefined) {
    return;
  }
  const expression = text.slice(start + 1, end - 1).trim();
  return {
    name:
      getStaticBracketPropertyName(expression) ?? dynamicStringIndexProperty,
    nameStart: start,
    end,
  };
}

function getStaticBracketPropertyName(expression: string): string | undefined {
  if (!expression) {
    return;
  }
  if (
    (expression[0] === "'" || expression[0] === '"') &&
    expression[expression.length - 1] === expression[0]
  ) {
    const value = expression.slice(1, -1);
    return isValidIdentifier(value) ? value : expression;
  }
  return isNumberLiteral(expression) ? expression : undefined;
}
