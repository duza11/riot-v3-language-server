import {
  isIdentifierPart,
  isIdentifierStart,
  scanBalanced,
  scanComment,
  scanJavaScriptNonCode,
} from '../scanners';
import type { ScriptProperty } from '../types';
import { inferJSDocFunctionType, parseJSDocType } from './jsdoc';
import type { AssignedPropertyType, ScriptPropertyAssignment } from './types';

export function inferAssignedPropertyTypeIfAssigned(
  text: string,
  nameEnd: number,
  jsDoc: string | undefined,
): AssignedPropertyType | undefined {
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
    return;
  }
  cursor++;
  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor++;
  }
  const jsDocType = jsDoc ? parseJSDocType(jsDoc) : undefined;
  if (jsDocType) {
    return { typeName: jsDocType, typeOrigin: 'explicit' };
  }
  const jsDocFunctionType = jsDoc
    ? inferJSDocFunctionType(text, cursor, jsDoc)
    : undefined;
  if (jsDocFunctionType) {
    return { typeName: jsDocFunctionType, typeOrigin: 'explicit' };
  }
  return {
    typeName: inferExpressionType(text, cursor),
    typeOrigin: 'inferred',
  };
}

export function createScriptPropertyFromAssignment(
  assignment: ScriptPropertyAssignment,
): ScriptProperty {
  const [name, ...path] = assignment.path;
  return {
    name,
    sourceOffset: assignment.sourceOffset,
    typeName: path.length
      ? createNestedObjectType(path, assignment.typeName)
      : assignment.typeName,
    assignmentKind: path.length ? 'augmentation' : 'replacement',
    typeOrigin: assignment.typeOrigin,
  };
}

function createNestedObjectType(path: string[], typeName: string): string {
  const [name, ...rest] = path;
  const nestedType = rest.length
    ? createNestedObjectType(rest, typeName)
    : typeName;
  return formatObjectType([{ name, typeName: nestedType }]);
}

export function mergeScriptProperty(
  existing: ScriptProperty | undefined,
  next: ScriptProperty,
): ScriptProperty {
  if (!existing) {
    return next;
  }
  if (existing.typeOrigin === 'explicit') {
    return existing;
  }
  if (next.typeOrigin === 'explicit' && next.assignmentKind === 'replacement') {
    return next;
  }
  if (existing.typeName === 'any') {
    return next;
  }
  if (next.typeName === 'any' || existing.typeName === next.typeName) {
    return existing;
  }
  if (next.assignmentKind === 'augmentation') {
    const typeName = mergePropertyTypes(existing.typeName, next.typeName);
    return typeName !== undefined
      ? { ...existing, typeName, unionTypeNames: undefined }
      : existing;
  }
  const unionTypeNames = [
    ...(existing.unionTypeNames ?? [existing.typeName]),
    ...(next.unionTypeNames ?? [next.typeName]),
  ].filter((typeName, index, types) => types.indexOf(typeName) === index);
  return {
    ...existing,
    typeName: formatUnionType(unionTypeNames),
    unionTypeNames,
  };
}

function formatUnionType(typeNames: string[]): string {
  return typeNames.map(parenthesizeUnionMember).join(' | ');
}

function parenthesizeUnionMember(typeName: string): string {
  return typeName.includes('=>') ? `(${typeName})` : typeName;
}

function mergePropertyTypes(
  currentType: string,
  nextType: string,
): string | undefined {
  const currentObject = parseObjectType(currentType);
  const nextObject = parseObjectType(nextType);
  if (!currentObject || !nextObject) {
    return;
  }
  const properties = new Map<string, ObjectTypeProperty>();
  for (const property of currentObject) {
    properties.set(property.name, property);
  }
  for (const property of nextObject) {
    const existing = properties.get(property.name);
    if (!existing) {
      properties.set(property.name, property);
      continue;
    }
    const typeName =
      mergePropertyTypes(existing.typeName, property.typeName) ??
      (existing.typeName === 'any' && property.typeName !== 'any'
        ? property.typeName
        : existing.typeName);
    properties.set(property.name, { ...existing, typeName });
  }
  return formatObjectType([...properties.values()]);
}

interface ObjectTypeProperty {
  name: string;
  typeName: string;
}

function parseObjectType(typeName: string): ObjectTypeProperty[] | undefined {
  const trimmed = typeName.trim();
  if (
    !trimmed.startsWith('{') ||
    scanBalanced(trimmed, 0, '{', '}') !== trimmed.length
  ) {
    return;
  }
  const body = trimmed.slice(1, -1).trim();
  if (!body) {
    return [];
  }
  const properties: ObjectTypeProperty[] = [];
  for (const member of splitTopLevelTypeMembers(body)) {
    const colon = findTopLevelPropertyColon(member);
    if (colon === undefined) {
      return;
    }
    const name = member.slice(0, colon).trim();
    const memberType = member.slice(colon + 1).trim();
    if (!name || !memberType) {
      return;
    }
    properties.push({ name, typeName: memberType });
  }
  return properties;
}

function splitTopLevelTypeMembers(text: string): string[] {
  const members: string[] = [];
  let memberStart = 0;
  let braceDepth = 0;
  for (let offset = 0; offset <= text.length; offset++) {
    const char = text[offset];
    if (char === '{') {
      braceDepth++;
    } else if (char === '}') {
      braceDepth--;
    } else if ((char === ';' || offset === text.length) && braceDepth === 0) {
      const member = text.slice(memberStart, offset).trim();
      if (member) {
        members.push(member);
      }
      memberStart = offset + 1;
    }
  }
  return members;
}

function formatObjectType(properties: ObjectTypeProperty[]): string {
  return `{ ${properties
    .map((property) => `${property.name}: ${property.typeName};`)
    .join(' ')} }`;
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
  return formatArrayType(elementTypes);
}

function formatArrayType(elementTypes: string[]): string {
  const uniqueElementTypes = [...new Set(elementTypes)];
  const elementType = uniqueElementTypes.join(' | ');
  const requiresParentheses =
    uniqueElementTypes.length > 1 ||
    elementType.startsWith('(...args: any[]) =>');
  return `${requiresParentheses ? `(${elementType})` : elementType}[]`;
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
        typeName?: string;
      } => property !== undefined,
    );
  if (!properties.length) {
    return 'Record<string, any>';
  }
  return `{ ${properties
    .map(
      (property) =>
        `${property.name}: ${property.typeName ?? inferExpressionType(property.value, 0)};`,
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

function parseObjectLiteralProperty(
  text: string,
): { name: string; value: string; typeName?: string } | undefined {
  const typeName = getLeadingJSDocType(text);
  const trimmed = stripLeadingComments(text).trim();
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
  return name ? { name, value, typeName } : undefined;
}

function getLeadingJSDocType(text: string): string | undefined {
  let cursor = 0;
  while (cursor < text.length) {
    while (cursor < text.length && /\s/.test(text[cursor])) {
      cursor++;
    }
    if (
      text[cursor] !== '/' ||
      (text[cursor + 1] !== '/' && text[cursor + 1] !== '*')
    ) {
      return;
    }
    const commentEnd = scanComment(text, cursor);
    const typeName = parseJSDocType(text.slice(cursor, commentEnd));
    if (typeName) {
      return typeName;
    }
    cursor = commentEnd;
  }
}

function stripLeadingComments(text: string): string {
  let cursor = 0;
  for (;;) {
    while (cursor < text.length && /\s/.test(text[cursor])) {
      cursor++;
    }
    if (
      text[cursor] !== '/' ||
      (text[cursor + 1] !== '/' && text[cursor + 1] !== '*')
    ) {
      break;
    }
    cursor = scanComment(text, cursor);
  }
  return text.slice(cursor);
}

function findTopLevelPropertyColon(text: string): number | undefined {
  for (let offset = 0; offset < text.length; ) {
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

function isNumberLiteralStart(text: string, start: number): boolean {
  return (
    /\d/.test(text[start]) ||
    (text[start] === '.' && /\d/.test(text[start + 1] ?? ''))
  );
}

export function isNumberLiteral(text: string): boolean {
  return /^-?(?:\d+|\d*\.\d+)$/.test(text);
}

function findArrowAfterExpressionStart(
  text: string,
  start: number,
): number | undefined {
  for (let offset = start; offset < text.length; ) {
    const char = text[offset];
    const skipped = scanJavaScriptNonCode(text, offset);
    if (skipped !== undefined) {
      offset = skipped;
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

export function isValidIdentifier(text: string): boolean {
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
