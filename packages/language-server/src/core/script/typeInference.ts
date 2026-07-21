import {
  isIdentifierPart,
  isIdentifierStart,
  scanBalanced,
  scanComment,
  scanJavaScriptNonCode,
} from '../scanners';
import {
  formatArrayType,
  formatObjectType,
  formatObjectTypeShape,
  formatUnionType,
  type ObjectTypeProperty,
  parseArrayType,
  parseObjectTypeShape,
  splitTopLevelUnionTypes,
} from '../typeSyntax';
import type { ScriptProperty } from '../types';
import {
  hasExplicitFirstFunctionParameterType,
  inferJSDocFunctionType,
  parseJSDocType,
} from './jsdoc';
import {
  type AssignedPropertyType,
  dynamicStringIndexProperty,
  type ScriptPropertyAssignment,
} from './types';

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
    return {
      typeName: jsDocFunctionType,
      typeOrigin: 'explicit',
      hasExplicitFirstParameterType: hasExplicitFirstFunctionParameterType(
        text,
        cursor,
        jsDoc ?? '',
      ),
    };
  }
  const typeName = inferExpressionType(text, cursor);
  return {
    typeName,
    typeOrigin: 'inferred',
    explicitTypePaths:
      text[cursor] === '{'
        ? getObjectLiteralExplicitTypePaths(text, cursor)
        : undefined,
  };
}

export function createScriptPropertyFromAssignment(
  assignment: ScriptPropertyAssignment,
): ScriptProperty {
  const [name, ...path] = assignment.path;
  const assignedTypeName = assignment.assignedTypeName ?? assignment.typeName;
  return {
    name,
    sourceOffset: assignment.sourceOffset,
    typeName: path.length
      ? createNestedObjectType(path, assignment.typeName)
      : assignment.typeName,
    assignmentKind: path.length ? 'augmentation' : 'replacement',
    typeOrigin: assignment.typeOrigin,
    inferredAnyAssignmentPaths:
      assignment.isAssignment &&
      assignment.typeOrigin === 'inferred' &&
      assignedTypeName === 'any'
        ? [getInferredAnyAssignmentPath(path)]
        : undefined,
    explicitTypePaths:
      assignment.typeOrigin === 'explicit'
        ? [path]
        : assignment.explicitTypePaths?.map((explicitPath) => [
            ...path,
            ...explicitPath,
          ]),
    hasExplicitFirstParameterType: assignment.hasExplicitFirstParameterType,
    assignmentPath: path.length ? path : undefined,
    assignedTypeName: path.length ? assignedTypeName : undefined,
  };
}

function getInferredAnyAssignmentPath(path: string[]): string[] {
  const dynamicIndex = path.indexOf(dynamicStringIndexProperty);
  return dynamicIndex === -1 ? path : path.slice(0, dynamicIndex);
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
  const inferredAnyAssignmentPaths = mergePropertyPaths(
    existing.inferredAnyAssignmentPaths,
    next.inferredAnyAssignmentPaths,
  );
  const explicitTypePaths = mergePropertyPaths(
    existing.explicitTypePaths,
    next.explicitTypePaths,
  );
  if (existing.typeName === 'any') {
    return { ...next, inferredAnyAssignmentPaths, explicitTypePaths };
  }
  if (next.typeName === 'any' || existing.typeName === next.typeName) {
    return { ...existing, inferredAnyAssignmentPaths, explicitTypePaths };
  }
  if (next.assignmentKind === 'augmentation') {
    const typeName =
      next.assignmentPath && next.assignedTypeName
        ? (mergePropertyAtPath(
            existing.typeName,
            next.assignmentPath,
            next.assignedTypeName,
            existing.explicitTypePaths,
            next.explicitTypePaths,
          ) ??
          mergePropertyTypes(
            existing.typeName,
            next.typeName,
            existing.explicitTypePaths,
            next.explicitTypePaths,
          ))
        : mergePropertyTypes(
            existing.typeName,
            next.typeName,
            existing.explicitTypePaths,
            next.explicitTypePaths,
          );
    const mergedTypeNames = typeName
      ? splitTopLevelUnionTypes(typeName)
      : undefined;
    return typeName !== undefined
      ? {
          ...existing,
          typeName,
          inferredAnyAssignmentPaths,
          explicitTypePaths,
          unionTypeNames:
            mergedTypeNames && mergedTypeNames.length > 1
              ? mergedTypeNames
              : undefined,
        }
      : { ...existing, inferredAnyAssignmentPaths, explicitTypePaths };
  }
  const unionTypeNames = [
    ...(existing.unionTypeNames ?? [existing.typeName]),
    ...(next.unionTypeNames ?? [next.typeName]),
  ].filter((typeName, index, types) => types.indexOf(typeName) === index);
  return {
    ...existing,
    typeName: formatUnionType(unionTypeNames),
    inferredAnyAssignmentPaths,
    explicitTypePaths,
    unionTypeNames,
  };
}

function mergePropertyAtPath(
  currentType: string,
  remainingPath: string[],
  assignedType: string,
  currentExplicitPaths: string[][] | undefined,
  nextExplicitPaths: string[][] | undefined,
  path: string[] = [],
): string | undefined {
  const members = splitTopLevelUnionTypes(currentType);
  if (members.length > 1) {
    let mergedMember = false;
    const typeNames = members.map((member) => {
      const merged = mergePropertyMemberAtPath(
        member,
        remainingPath,
        assignedType,
        currentExplicitPaths,
        nextExplicitPaths,
        path,
      );
      if (merged !== undefined) {
        mergedMember = true;
        return merged;
      }
      return member;
    });
    return mergedMember ? formatUnionType(typeNames) : undefined;
  }
  return mergePropertyMemberAtPath(
    currentType,
    remainingPath,
    assignedType,
    currentExplicitPaths,
    nextExplicitPaths,
    path,
  );
}

function mergePropertyMemberAtPath(
  currentType: string,
  remainingPath: string[],
  assignedType: string,
  currentExplicitPaths: string[][] | undefined,
  nextExplicitPaths: string[][] | undefined,
  path: string[],
): string | undefined {
  const [part, ...rest] = remainingPath;
  if (part === undefined) {
    return mergeNestedPropertyTypes(
      currentType,
      assignedType,
      currentExplicitPaths,
      nextExplicitPaths,
      path,
    );
  }
  const propertyPath = [...path, part];
  const arrayElementType = parseArrayType(currentType);
  if (arrayElementType !== undefined && isArrayIndex(part)) {
    const elementType = rest.length
      ? mergePropertyAtPath(
          arrayElementType,
          rest,
          assignedType,
          currentExplicitPaths,
          nextExplicitPaths,
          propertyPath,
        )
      : mergeReplacementTypes(
          arrayElementType,
          assignedType,
          currentExplicitPaths,
          nextExplicitPaths,
          propertyPath,
        );
    return elementType === undefined ? undefined : formatArrayType(elementType);
  }
  if (part === dynamicStringIndexProperty) {
    return;
  }
  const objectShape = parseObjectTypeShape(currentType);
  if (!objectShape) {
    return;
  }
  const propertyName = getObjectLiteralPropertyPathName(part);
  const property = objectShape.properties.find(
    (candidate) =>
      getObjectLiteralPropertyPathName(candidate.name) === propertyName,
  );
  if (!property) {
    return formatObjectTypeShape({
      ...objectShape,
      properties: [
        ...objectShape.properties,
        {
          name: part,
          typeName: rest.length
            ? createNestedObjectType(rest, assignedType)
            : assignedType,
        },
      ],
    });
  }
  const typeName = rest.length
    ? (mergePropertyAtPath(
        property.typeName,
        rest,
        assignedType,
        currentExplicitPaths,
        nextExplicitPaths,
        propertyPath,
      ) ??
      mergeNestedPropertyTypes(
        property.typeName,
        createNestedObjectType(rest, assignedType),
        currentExplicitPaths,
        nextExplicitPaths,
        propertyPath,
      ))
    : mergeNestedPropertyTypes(
        property.typeName,
        assignedType,
        currentExplicitPaths,
        nextExplicitPaths,
        propertyPath,
      );
  return formatObjectTypeShape({
    ...objectShape,
    properties: objectShape.properties.map((candidate) =>
      candidate === property ? { ...candidate, typeName } : candidate,
    ),
  });
}

function mergeReplacementTypes(
  currentType: string,
  nextType: string,
  currentExplicitPaths: string[][] | undefined,
  nextExplicitPaths: string[][] | undefined,
  path: string[],
): string {
  if (isExplicitTypePath(currentExplicitPaths, path)) {
    return currentType;
  }
  if (isExplicitTypePath(nextExplicitPaths, path)) {
    return nextType;
  }
  if (currentType === 'any' && nextType !== 'any') {
    return nextType;
  }
  if (nextType === 'any' || currentType === nextType) {
    return currentType;
  }
  return formatUnionType(
    [
      ...splitTopLevelUnionTypes(currentType),
      ...splitTopLevelUnionTypes(nextType),
    ].filter(
      (typeName, index, typeNames) => typeNames.indexOf(typeName) === index,
    ),
  );
}

function isArrayIndex(part: string): boolean {
  return part === dynamicStringIndexProperty || /^(?:0|[1-9]\d*)$/.test(part);
}

function mergePropertyPaths(
  currentPaths: string[][] | undefined,
  nextPaths: string[][] | undefined,
): string[][] | undefined {
  const paths = [...(currentPaths ?? []), ...(nextPaths ?? [])];
  const uniquePaths = paths.filter(
    (path, index) =>
      paths.findIndex((candidate) => pathsEqual(candidate, path)) === index,
  );
  return uniquePaths.length ? uniquePaths : undefined;
}

function pathsEqual(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((part, index) => part === right[index])
  );
}

function mergePropertyTypes(
  currentType: string,
  nextType: string,
  currentExplicitPaths: string[][] | undefined = undefined,
  nextExplicitPaths: string[][] | undefined = undefined,
  path: string[] = [],
): string | undefined {
  const currentMembers = splitTopLevelUnionTypes(currentType);
  if (currentMembers.length > 1) {
    let mergedMember = false;
    const typeNames = currentMembers.map((member) => {
      const merged = mergeObjectTypes(
        member,
        nextType,
        currentExplicitPaths,
        nextExplicitPaths,
        path,
      );
      if (merged !== undefined) {
        mergedMember = true;
        return merged;
      }
      return member;
    });
    return mergedMember ? formatUnionType(typeNames) : undefined;
  }
  return mergeObjectTypes(
    currentType,
    nextType,
    currentExplicitPaths,
    nextExplicitPaths,
    path,
  );
}

function mergeObjectTypes(
  currentType: string,
  nextType: string,
  currentExplicitPaths: string[][] | undefined,
  nextExplicitPaths: string[][] | undefined,
  path: string[],
): string | undefined {
  const currentObject = parseObjectTypeShape(currentType);
  const nextObject = parseObjectTypeShape(nextType);
  if (!currentObject || !nextObject) {
    return;
  }
  const properties = new Map<string, ObjectTypeProperty>();
  for (const property of currentObject.properties) {
    properties.set(property.name, property);
  }
  for (const property of nextObject.properties) {
    const existing = properties.get(property.name);
    if (!existing) {
      properties.set(property.name, property);
      continue;
    }
    const propertyPath = [
      ...path,
      getObjectLiteralPropertyPathName(property.name),
    ];
    const typeName = mergeNestedPropertyTypes(
      existing.typeName,
      property.typeName,
      currentExplicitPaths,
      nextExplicitPaths,
      propertyPath,
    );
    properties.set(property.name, { ...existing, typeName });
  }
  return formatObjectTypeShape({
    properties: [...properties.values()],
    open: currentObject.open || nextObject.open,
  });
}

function mergeNestedPropertyTypes(
  currentType: string,
  nextType: string,
  currentExplicitPaths: string[][] | undefined,
  nextExplicitPaths: string[][] | undefined,
  path: string[],
): string {
  if (isExplicitTypePath(currentExplicitPaths, path)) {
    return currentType;
  }
  if (isExplicitTypePath(nextExplicitPaths, path)) {
    return nextType;
  }
  const mergedObject = mergePropertyTypes(
    currentType,
    nextType,
    currentExplicitPaths,
    nextExplicitPaths,
    path,
  );
  if (mergedObject !== undefined) {
    return mergedObject;
  }
  if (currentType === 'any' && nextType !== 'any') {
    return nextType;
  }
  if (nextType === 'any' || currentType === nextType) {
    return currentType;
  }
  return formatUnionType(
    [
      ...splitTopLevelUnionTypes(currentType),
      ...splitTopLevelUnionTypes(nextType),
    ].filter(
      (typeName, index, typeNames) => typeNames.indexOf(typeName) === index,
    ),
  );
}

function isExplicitTypePath(
  explicitPaths: string[][] | undefined,
  path: string[],
): boolean {
  return Boolean(
    explicitPaths?.some(
      (explicitPath) =>
        explicitPath.length <= path.length &&
        explicitPath.every((part, index) => path[index] === part),
    ),
  );
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
  return formatInferredArrayType(elementTypes);
}

function formatInferredArrayType(elementTypes: string[]): string {
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

function getObjectLiteralExplicitTypePaths(
  text: string,
  start: number,
): string[][] | undefined {
  const end = scanBalanced(text, start, '{', '}');
  if (end === undefined) {
    return;
  }
  const paths: string[][] = [];
  for (const member of splitTopLevelCommaSeparated(
    text.slice(start + 1, end - 1),
  )) {
    const property = parseObjectLiteralProperty(member);
    if (!property) {
      continue;
    }
    const name = getObjectLiteralPropertyPathName(property.name);
    if (property.typeName) {
      paths.push([name]);
      continue;
    }
    const value = property.value.trim();
    if (value[0] !== '{') {
      continue;
    }
    for (const path of getObjectLiteralExplicitTypePaths(value, 0) ?? []) {
      paths.push([name, ...path]);
    }
  }
  return paths.length ? paths : undefined;
}

function getObjectLiteralPropertyPathName(typeName: string): string {
  return typeName[0] === "'" || typeName[0] === '"'
    ? typeName.slice(1, -1)
    : typeName;
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
