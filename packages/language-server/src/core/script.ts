import type { CodeMapping } from '@volar/language-core';
import type * as ts from 'typescript';
import {
  isIdentifierPart,
  isIdentifierStart,
  scanBalanced,
  scanComment,
  scanIdentifierEnd,
  scanString,
} from './scanners';
import type {
  GeneratedSegment,
  ScriptBlock,
  ScriptProperty,
  TextRange,
} from './types';

const riotV3ScriptContextSuffix = `
}
`;

const riotV3ImportStatement =
  /^\s*import(?!\w|(\s)?\()(?:(?:\s|[^\s'"])*)['|"].*\n?/gm;

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
      if (
        !existing ||
        (existing.typeName === 'any' && property.typeName !== 'any')
      ) {
        properties.set(property.name, property);
      }
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

export function scanInstanceProperties(
  text: string,
  sourceOffset: number,
  sharedAliases: string[] = [],
): ScriptProperty[] {
  const aliases = [...sharedAliases];
  for (const alias of getThisAliases(text)) {
    if (!aliases.includes(alias)) {
      aliases.push(alias);
    }
  }
  const properties = scanThisProperties(text, sourceOffset);
  for (const alias of aliases) {
    properties.push(...scanAliasProperties(text, sourceOffset, alias));
  }
  return properties;
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
          properties.push({
            name,
            sourceOffset: sourceOffset + method.nameStart,
            typeName: '(...args: any[]) => any',
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

export function generateScriptVirtualText(
  blocks: { text: string; sourceOffset: number }[],
  prefix: string,
): { text: string; mappings: CodeMapping[] } {
  const importSegments: GeneratedSegment[] = [];
  const bodySegments: GeneratedSegment[] = [{ text: prefix }];
  for (let index = 0; index < blocks.length; index++) {
    if (index > 0) {
      bodySegments.push({ text: '\n' });
    }
    const { imports, bodyRanges } = splitScriptImports(blocks[index].text);
    for (const imported of imports) {
      pushMappedScriptSegment(
        importSegments,
        blocks[index].text,
        imported.start,
        imported.end,
        blocks[index].sourceOffset,
      );
      if (
        !blocks[index].text.slice(imported.start, imported.end).endsWith('\n')
      ) {
        importSegments.push({ text: '\n' });
      }
    }
    for (const range of bodyRanges) {
      bodySegments.push(
        ...generateScriptSegments(
          blocks[index].text.slice(range.start, range.end),
          blocks[index].sourceOffset + range.start,
        ),
      );
    }
  }
  bodySegments.push({ text: riotV3ScriptContextSuffix });
  const segments = importSegments.length
    ? [...importSegments, { text: '\n' }, ...bodySegments]
    : bodySegments;
  let generatedText = '';
  const sourceOffsets: number[] = [];
  const generatedOffsets: number[] = [];
  const lengths: number[] = [];
  const generatedLengths: number[] = [];

  for (const segment of segments) {
    const generatedOffset = generatedText.length;
    generatedText += segment.text;
    if (segment.sourceOffset !== undefined && segment.length !== undefined) {
      sourceOffsets.push(segment.sourceOffset);
      generatedOffsets.push(generatedOffset);
      lengths.push(segment.length);
      generatedLengths.push(segment.generatedLength ?? segment.length);
    }
  }

  return {
    text: generatedText,
    mappings: sourceOffsets.length
      ? [
          {
            sourceOffsets,
            generatedOffsets,
            lengths,
            generatedLengths,
            data: {
              completion: true,
              format: true,
              navigation: true,
              semantic: true,
              structure: true,
              verification: true,
            },
          },
        ]
      : [],
  };
}

function scanThisProperties(
  text: string,
  sourceOffset: number,
): ScriptProperty[] {
  const properties: ScriptProperty[] = [];
  for (let offset = 0; offset < text.length; ) {
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
    if (
      text.startsWith('this', offset) &&
      !isIdentifierPart(text[offset - 1] ?? '') &&
      !isIdentifierPart(text[offset + 4] ?? '')
    ) {
      const property = scanThisProperty(text, offset, sourceOffset);
      if (property) {
        properties.push(property);
        offset = property.sourceOffset - sourceOffset + property.name.length;
        continue;
      }
    }
    offset++;
  }
  return properties;
}

function scanAliasProperties(
  text: string,
  sourceOffset: number,
  alias: string,
): ScriptProperty[] {
  const properties: ScriptProperty[] = [];
  for (let offset = 0; offset < text.length; ) {
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
    if (
      text.startsWith(alias, offset) &&
      !isIdentifierPart(text[offset - 1] ?? '') &&
      !isIdentifierPart(text[offset + alias.length] ?? '')
    ) {
      const property = scanAliasProperty(text, offset, sourceOffset, alias);
      if (property) {
        properties.push(property);
        offset = property.sourceOffset - sourceOffset + property.name.length;
        continue;
      }
    }
    offset++;
  }
  return properties;
}

function scanAliasProperty(
  text: string,
  aliasOffset: number,
  sourceOffset: number,
  alias: string,
): ScriptProperty | undefined {
  let cursor = aliasOffset + alias.length;
  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor++;
  }
  if (text[cursor] !== '.') {
    return;
  }
  cursor++;
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
  const name = text.slice(nameStart, cursor);
  if (scriptReservedWords.has(name) || riotV3TagInstanceMembers.has(name)) {
    return;
  }
  return {
    name,
    sourceOffset: sourceOffset + nameStart,
    typeName: inferAssignedPropertyType(text, cursor),
  };
}

function getThisAliases(text: string): string[] {
  const aliases: string[] = [];
  for (let offset = 0; offset < text.length; ) {
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

function scanThisProperty(
  text: string,
  thisOffset: number,
  sourceOffset: number,
): ScriptProperty | undefined {
  let cursor = thisOffset + 'this'.length;
  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor++;
  }
  if (text[cursor] !== '.') {
    return;
  }
  cursor++;
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
  const name = text.slice(nameStart, cursor);
  if (scriptReservedWords.has(name) || riotV3TagInstanceMembers.has(name)) {
    return;
  }
  return {
    name,
    sourceOffset: sourceOffset + nameStart,
    typeName: inferAssignedPropertyType(text, cursor),
  };
}

function inferAssignedPropertyType(text: string, nameEnd: number): string {
  let cursor = nameEnd;
  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor++;
  }
  if (
    text[cursor] !== '=' ||
    text[cursor + 1] === '=' ||
    text[cursor - 1] === '!' ||
    text[cursor - 1] === '<' ||
    text[cursor - 1] === '>'
  ) {
    return 'any';
  }
  cursor++;
  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor++;
  }
  return inferExpressionType(text, cursor);
}

function inferExpressionType(text: string, start: number): string {
  if (text[start] === "'" || text[start] === '"' || text[start] === '`') {
    return 'string';
  }
  if (
    text.startsWith('true', start) &&
    !isIdentifierPart(text[start + 4] ?? '')
  ) {
    return 'boolean';
  }
  if (
    text.startsWith('false', start) &&
    !isIdentifierPart(text[start + 5] ?? '')
  ) {
    return 'boolean';
  }
  if (
    text.startsWith('null', start) &&
    !isIdentifierPart(text[start + 4] ?? '')
  ) {
    return 'null';
  }
  if (
    text.startsWith('undefined', start) &&
    !isIdentifierPart(text[start + 9] ?? '')
  ) {
    return 'undefined';
  }
  if (isNumberLiteralStart(text, start)) {
    return 'number';
  }
  if (text[start] === '[') {
    return inferArrayLiteralType(text, start);
  }
  if (text[start] === '{') {
    return inferObjectLiteralType(text, start);
  }
  if (
    text.startsWith('function', start) &&
    !isIdentifierPart(text[start + 'function'.length] ?? '')
  ) {
    return '(...args: any[]) => any';
  }
  if (
    text.startsWith('async', start) &&
    !isIdentifierPart(text[start + 'async'.length] ?? '')
  ) {
    let cursor = start + 'async'.length;
    while (cursor < text.length && /\s/.test(text[cursor])) {
      cursor++;
    }
    if (
      text.startsWith('function', cursor) ||
      text[cursor] === '(' ||
      isIdentifierStart(text[cursor])
    ) {
      return '(...args: any[]) => any';
    }
  }
  if (text[start] === '(' || isIdentifierStart(text[start])) {
    const arrowOffset = findArrowAfterExpressionStart(text, start);
    if (arrowOffset !== undefined) {
      return '(...args: any[]) => any';
    }
  }
  return 'any';
}

function inferArrayLiteralType(text: string, start: number): string {
  const end = scanBalanced(text, start, '[', ']');
  if (end === undefined) {
    return 'any[]';
  }
  const elements = splitTopLevelCommaSeparated(text.slice(start + 1, end - 1));
  const elementTypes = elements
    .map((element) => element.trim())
    .filter(Boolean)
    .map((element) => inferExpressionType(element, 0));
  if (!elementTypes.length) {
    return 'any[]';
  }
  return getUnionType(elementTypes) + '[]';
}

function inferObjectLiteralType(text: string, start: number): string {
  const end = scanBalanced(text, start, '{', '}');
  if (end === undefined) {
    return 'Record<string, any>';
  }
  const properties = splitTopLevelCommaSeparated(text.slice(start + 1, end - 1))
    .map(parseObjectLiteralProperty)
    .filter(
      (
        property,
      ): property is {
        name: string;
        value: string;
      } => property !== undefined,
    );
  if (!properties.length) {
    return 'Record<string, any>';
  }
  return `{ ${properties
    .map(
      (property) =>
        `${property.name}: ${inferExpressionType(property.value, 0)};`,
    )
    .join(' ')} }`;
}

function splitTopLevelCommaSeparated(text: string): string[] {
  const segments: string[] = [];
  let segmentStart = 0;
  for (let offset = 0; offset <= text.length; ) {
    if (offset === text.length) {
      segments.push(text.slice(segmentStart, offset));
      break;
    }
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
    if (char === '(') {
      offset = scanBalanced(text, offset, '(', ')') ?? text.length;
      continue;
    }
    if (char === '[') {
      offset = scanBalanced(text, offset, '[', ']') ?? text.length;
      continue;
    }
    if (char === '{') {
      offset = scanBalanced(text, offset, '{', '}') ?? text.length;
      continue;
    }
    if (char === ',') {
      segments.push(text.slice(segmentStart, offset));
      segmentStart = offset + 1;
    }
    offset++;
  }
  return segments;
}

function parseObjectLiteralProperty(
  text: string,
): { name: string; value: string } | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }
  const colon = findTopLevelPropertyColon(trimmed);
  if (colon === undefined) {
    if (isValidIdentifier(trimmed)) {
      return { name: trimmed, value: 'undefined' };
    }
    return;
  }
  const rawName = trimmed.slice(0, colon).trim();
  const value = trimmed.slice(colon + 1).trim();
  if (!value) {
    return;
  }
  const name = formatObjectLiteralTypePropertyName(rawName);
  return name ? { name, value } : undefined;
}

function findTopLevelPropertyColon(text: string): number | undefined {
  for (let offset = 0; offset < text.length; ) {
    const char = text[offset];
    if (char === "'" || char === '"' || char === '`') {
      offset = scanString(text, offset);
      continue;
    }
    if (char === '(') {
      offset = scanBalanced(text, offset, '(', ')') ?? text.length;
      continue;
    }
    if (char === '[') {
      offset = scanBalanced(text, offset, '[', ']') ?? text.length;
      continue;
    }
    if (char === '{') {
      offset = scanBalanced(text, offset, '{', '}') ?? text.length;
      continue;
    }
    if (char === ':') {
      return offset;
    }
    offset++;
  }
}

function formatObjectLiteralTypePropertyName(text: string): string | undefined {
  if (isValidIdentifier(text)) {
    return text;
  }
  if (
    (text[0] === "'" || text[0] === '"') &&
    text[text.length - 1] === text[0]
  ) {
    return text;
  }
}

function getUnionType(types: string[]): string {
  return [...new Set(types)].join(' | ');
}

function isNumberLiteralStart(text: string, start: number): boolean {
  return (
    /\d/.test(text[start]) ||
    (text[start] === '.' && /\d/.test(text[start + 1] ?? ''))
  );
}

function findArrowAfterExpressionStart(
  text: string,
  start: number,
): number | undefined {
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
    if (char === '=' && text[offset + 1] === '>') {
      return offset;
    }
    if (char === '\n' || char === ';') {
      return;
    }
    offset++;
  }
}

function splitScriptImports(text: string): {
  imports: TextRange[];
  bodyRanges: TextRange[];
} {
  const imports: TextRange[] = [];
  riotV3ImportStatement.lastIndex = 0;
  for (
    let match = riotV3ImportStatement.exec(text);
    match;
    match = riotV3ImportStatement.exec(text)
  ) {
    imports.push({
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  if (!imports.length) {
    return {
      imports,
      bodyRanges: [{ start: 0, end: text.length }],
    };
  }

  const bodyRanges: TextRange[] = [];
  let cursor = 0;
  for (const imported of imports) {
    if (cursor < imported.start) {
      bodyRanges.push({ start: cursor, end: imported.start });
    }
    cursor = imported.end;
  }
  if (cursor < text.length) {
    bodyRanges.push({ start: cursor, end: text.length });
  }
  return { imports, bodyRanges };
}

function generateScriptSegments(
  text: string,
  sourceOffset: number,
): GeneratedSegment[] {
  const segments: GeneratedSegment[] = [];
  let offset = 0;
  let lastMappedOffset = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;

  while (offset < text.length) {
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
        pushMappedScriptSegment(
          segments,
          text,
          lastMappedOffset,
          method.nameStart,
          sourceOffset,
        );
        segments.push({ text: '\nthis.' });
        pushMappedScriptSegment(
          segments,
          text,
          method.nameStart,
          method.nameEnd,
          sourceOffset,
        );
        segments.push({ text: ' = function' });
        pushMappedScriptSegment(
          segments,
          text,
          method.nameEnd,
          method.bodyEnd,
          sourceOffset,
        );
        offset = method.bodyEnd;
        lastMappedOffset = method.bodyEnd;
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

  pushMappedScriptSegment(
    segments,
    text,
    lastMappedOffset,
    text.length,
    sourceOffset,
  );
  return segments;
}

function pushMappedScriptSegment(
  segments: GeneratedSegment[],
  text: string,
  start: number,
  end: number,
  sourceOffset: number,
): void {
  if (start >= end) {
    return;
  }
  segments.push({
    text: text.slice(start, end),
    sourceOffset: sourceOffset + start,
    length: end - start,
  });
}

interface RiotV3MethodDefinition {
  nameStart: number;
  nameEnd: number;
  bodyEnd: number;
}

function scanRiotV3MethodDefinition(
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
    bodyEnd,
  };
}

function scanFunctionLikeEnd(text: string, start: number): number | undefined {
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

const riotV3TagInstanceMembers = new Set([
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

const scriptReservedWords = new Set([
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
