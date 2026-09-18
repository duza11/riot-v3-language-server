import type * as ts from 'typescript';
import {
  isIdentifierPart,
  isIdentifierStart,
  scanBalanced,
  scanComment,
  scanIdentifierEnd,
  scanJavaScriptNonCode,
} from '../scanners';
import type { JSDocTypedef, ScriptBlock } from '../types';

export function getScriptJSDocTypedefs(
  snapshot: ts.IScriptSnapshot,
  scripts: ScriptBlock[],
): JSDocTypedef[] {
  const typedefs = new Map<string, JSDocTypedef>();
  for (const script of scripts) {
    const text = snapshot.getText(script.start, script.end);
    for (let offset = 0; offset < text.length; ) {
      if (text[offset] === '/' && text[offset + 1] === '*') {
        const commentEnd = scanComment(text, offset);
        if (text[offset + 2] === '*') {
          for (const typedef of parseJSDocTypedefs(
            text.slice(offset, commentEnd),
          )) {
            typedefs.set(typedef.name, typedef);
          }
        }
        offset = commentEnd;
        continue;
      }
      const skipped = scanJavaScriptNonCode(text, offset);
      if (skipped !== undefined) {
        offset = skipped;
        continue;
      }
      offset++;
    }
  }
  return [...typedefs.values()];
}

export function findPrecedingJSDoc(
  text: string,
  offset: number,
): string | undefined {
  let cursor = offset;
  while (cursor > 0 && /\s/.test(text[cursor - 1])) {
    cursor--;
  }
  if (!text.slice(0, cursor).endsWith('*/')) {
    return;
  }
  const commentStart = text.lastIndexOf('/**', cursor - 2);
  if (commentStart === -1) {
    return;
  }
  const commentEnd = scanComment(text, commentStart);
  return commentEnd === cursor
    ? text.slice(commentStart, commentEnd)
    : undefined;
}

export function inferJSDocFunctionType(
  text: string,
  start: number,
  jsDoc: string,
): string | undefined {
  const parameters = parseFunctionExpressionParameters(text, start);
  if (!parameters) {
    return;
  }
  const jsDocTypes = parseJSDocFunctionTypes(jsDoc);
  const typedParameters = parameters.map((parameter) => {
    const typeName = jsDocTypes.params.get(parameter) ?? 'any';
    return `${parameter}: ${typeName}`;
  });
  return `(${typedParameters.join(', ')}) => ${jsDocTypes.returnType ?? 'any'}`;
}

export function hasExplicitFirstFunctionParameterType(
  text: string,
  start: number,
  jsDoc: string,
): boolean | undefined {
  const parameters = parseFunctionExpressionParameters(text, start);
  if (!parameters?.length) {
    return;
  }
  return parseJSDocFunctionTypes(jsDoc).params.has(parameters[0]);
}

export function inferJSDocRiotMethodType(
  text: string,
  nameEnd: number,
  jsDoc: string | undefined,
): string | undefined {
  if (!jsDoc) {
    return;
  }
  const parameters = parseRiotMethodParameters(text, nameEnd);
  if (!parameters) {
    return;
  }
  const jsDocTypes = parseJSDocFunctionTypes(jsDoc);
  const typedParameters = parameters.map((parameter) => {
    const typeName = jsDocTypes.params.get(parameter) ?? 'any';
    return `${parameter}: ${typeName}`;
  });
  return `(${typedParameters.join(', ')}) => ${jsDocTypes.returnType ?? 'any'}`;
}

export function parseJSDocType(comment: string): string | undefined {
  return parseTypedJSDocTags(comment).find((tag) => tag.kind === 'type')
    ?.typeName;
}

function parseTypedJSDocTags(comment: string): {
  kind: string;
  typeName: string;
  name?: string;
}[] {
  const text = comment.replace(/^[\t ]*\*(?!\/)[\t ]?/gm, '');
  const pattern = /@(type|param|returns?|typedef|property)\b\s*\{/g;
  const tags: { kind: string; typeName: string; name?: string }[] = [];
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const start = pattern.lastIndex - 1;
    // A type may contain nested object literals and braces inside string literals.
    const end = scanBalanced(text, start, '{', '}');
    if (end === undefined) {
      continue;
    }
    const typeName = text.slice(start + 1, end - 1).trim();
    if (!typeName) {
      continue;
    }
    const name = /^\s*\[?([A-Za-z_$][\w$]*)/.exec(text.slice(end))?.[1];
    tags.push({ kind: match[1], typeName, name });
    pattern.lastIndex = end;
  }
  return tags;
}

export function parseRiotMethodParameters(
  text: string,
  nameEnd: number,
): string[] | undefined {
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
  return splitTopLevelCommaSeparated(text.slice(cursor + 1, paramsEnd - 1))
    .map(getFunctionParameterName)
    .filter((name): name is string => name !== undefined);
}

function parseFunctionExpressionParameters(
  text: string,
  start: number,
): string[] | undefined {
  return (
    parseTraditionalFunctionParameters(text, start) ??
    parseArrowFunctionParameters(text, start)
  );
}

function parseTraditionalFunctionParameters(
  text: string,
  start: number,
): string[] | undefined {
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
  return splitTopLevelCommaSeparated(text.slice(cursor + 1, paramsEnd - 1))
    .map(getFunctionParameterName)
    .filter((name): name is string => name !== undefined);
}

function parseArrowFunctionParameters(
  text: string,
  start: number,
): string[] | undefined {
  let cursor = start;
  if (
    text.startsWith('async', cursor) &&
    !isIdentifierPart(text[cursor + 'async'.length] ?? '')
  ) {
    cursor += 'async'.length;
    while (cursor < text.length && /\s/.test(text[cursor])) {
      cursor++;
    }
  }
  let parameters: string[];
  if (text[cursor] === '(') {
    const parametersEnd = scanBalanced(text, cursor, '(', ')');
    if (parametersEnd === undefined) {
      return;
    }
    parameters = splitTopLevelCommaSeparated(
      text.slice(cursor + 1, parametersEnd - 1),
    )
      .map(getFunctionParameterName)
      .filter((name): name is string => name !== undefined);
    cursor = parametersEnd;
  } else if (isIdentifierStart(text[cursor])) {
    const parameterEnd = scanIdentifierEnd(text, cursor);
    parameters = [text.slice(cursor, parameterEnd)];
    cursor = parameterEnd;
  } else {
    return;
  }
  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor++;
  }
  return text.startsWith('=>', cursor) ? parameters : undefined;
}

function getFunctionParameterName(text: string): string | undefined {
  const trimmed = text.trim();
  const withoutRest = trimmed.startsWith('...')
    ? trimmed.slice(3).trim()
    : trimmed;
  const name = withoutRest.split(/[=\s]/, 1)[0];
  return isValidIdentifier(name) ? name : undefined;
}

export function parseJSDocFunctionTypes(jsDoc: string): {
  params: Map<string, string>;
  returnType?: string;
} {
  const params = new Map<string, string>();
  const tags = parseTypedJSDocTags(jsDoc);
  for (const tag of tags) {
    if (tag.kind === 'param' && tag.name) {
      params.set(tag.name, tag.typeName);
    }
  }
  const returnType = tags.find(
    (tag) => tag.kind === 'return' || tag.kind === 'returns',
  )?.typeName;
  return {
    params,
    returnType,
  };
}

function parseJSDocTypedefs(comment: string): JSDocTypedef[] {
  const tags = parseTypedJSDocTags(comment);
  const properties = tags.flatMap((tag) =>
    tag.kind === 'property' && tag.name
      ? [{ name: tag.name, typeName: tag.typeName }]
      : [],
  );
  const typedefs: JSDocTypedef[] = [];
  for (const tag of tags) {
    if (tag.kind !== 'typedef' || !tag.name) {
      continue;
    }
    const { typeName, name } = tag;
    typedefs.push({
      name,
      typeName: properties.length
        ? formatObjectType(properties)
        : typeName === 'Object'
          ? 'Record<string, any>'
          : typeName,
    });
  }
  return typedefs;
}

function formatObjectType(
  properties: { name: string; typeName: string }[],
): string {
  return `{ ${properties
    .map((property) => `${property.name}: ${property.typeName};`)
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
    const skipped = scanJavaScriptNonCode(text, offset);
    if (skipped !== undefined) {
      offset = skipped;
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
