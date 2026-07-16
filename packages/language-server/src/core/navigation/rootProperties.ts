import type * as ts from 'typescript';
import {
  findPreviousNonWhitespace,
  isIdentifierPart,
  isIdentifierStart,
  scanTemplateNonIdentifier,
} from '../scanners';
import {
  getScriptProperties,
  getScriptThisAliases,
  scanInstancePropertyOccurrences,
  scanRiotV3MethodProperties,
} from '../script';
import {
  shouldPrefixTemplateIdentifier,
  type TemplateAnalysis,
  type TemplateExpression,
} from '../template';
import type { RiotV3Component, ScriptBlock, ScriptProperty } from '../types';
import type { IdentifierRange, NavigationOccurrence } from './types';

export function isRiotPropertyRenameSource(
  sourceText: string,
  identifier: IdentifierRange,
  scriptProperties: ScriptProperty[],
  snapshot: ts.IScriptSnapshot,
  component: RiotV3Component,
  templateAnalysis: TemplateAnalysis,
): boolean {
  if (!scriptProperties.some((property) => property.name === identifier.name)) {
    return false;
  }
  if (
    scriptProperties.some(
      (property) =>
        property.name === identifier.name &&
        identifier.start >= property.sourceOffset &&
        identifier.end <= property.sourceOffset + property.name.length,
    )
  ) {
    return true;
  }
  if (
    isInstancePropertyReference(
      sourceText,
      identifier.start,
      snapshot,
      component.scripts,
    )
  ) {
    return true;
  }
  return templateAnalysis.expressions.some(
    (expression) =>
      identifier.start >= expression.sourceOffset &&
      identifier.end <= expression.sourceOffset + expression.text.length &&
      getTemplateRenameOffsets(expression, identifier.name).includes(
        identifier.start,
      ),
  );
}

function isInstancePropertyReference(
  sourceText: string,
  identifierStart: number,
  snapshot: ts.IScriptSnapshot,
  scripts: ScriptBlock[],
): boolean {
  const qualifier = getPropertyQualifier(sourceText, identifierStart);
  if (qualifier === 'this') {
    return true;
  }
  if (!qualifier) {
    return false;
  }
  const script = scripts.find(
    (script) =>
      identifierStart >= script.start && identifierStart <= script.end,
  );
  if (!script) {
    return false;
  }
  const aliases = getScriptThisAliases(snapshot, scripts);
  return aliases.includes(qualifier);
}

function getPropertyQualifier(
  text: string,
  identifierStart: number,
): string | undefined {
  let cursor = identifierStart - 1;
  while (cursor >= 0 && /\s/.test(text[cursor])) {
    cursor--;
  }
  if (text[cursor] !== '.') {
    return;
  }
  cursor--;
  while (cursor >= 0 && /\s/.test(text[cursor])) {
    cursor--;
  }
  const end = cursor + 1;
  while (cursor >= 0 && isIdentifierPart(text[cursor])) {
    cursor--;
  }
  if (cursor + 1 < end) {
    return text.slice(cursor + 1, end);
  }
}

function getTemplateRenameOffsets(
  expression: TemplateExpression,
  name: string,
): number[] {
  const offsets: number[] = [];
  const text = expression.text;
  for (let offset = 0; offset < text.length; ) {
    const char = text[offset];
    if (isIdentifierStart(char)) {
      const start = offset;
      offset++;
      while (offset < text.length && isIdentifierPart(text[offset])) {
        offset++;
      }
      const identifier = text.slice(start, offset);
      if (
        identifier === name &&
        shouldRenameTemplateIdentifier(expression, start, identifier)
      ) {
        offsets.push(expression.sourceOffset + start);
      }
      continue;
    }
    offset = scanTemplateNonIdentifier(text, offset);
  }
  return offsets;
}

export function getRiotPropertyOccurrences(
  snapshot: ts.IScriptSnapshot,
  component: RiotV3Component,
  expressions: TemplateExpression[],
  name: string,
): NavigationOccurrence[] {
  const occurrences = getScriptNavigationOccurrences(
    snapshot,
    component.scripts,
    name,
  );
  for (const expression of expressions) {
    for (const offset of getTemplateRenameOffsets(expression, name)) {
      addOccurrence(occurrences, {
        start: offset,
        end: offset + name.length,
        role: 'read',
      });
    }
  }
  return occurrences;
}

function getScriptNavigationOccurrences(
  snapshot: ts.IScriptSnapshot,
  scripts: ScriptBlock[],
  name: string,
): NavigationOccurrence[] {
  const occurrences: NavigationOccurrence[] = [];
  const aliases = getScriptThisAliases(snapshot, scripts);
  const declarationOffsets = new Set(
    getScriptProperties(snapshot, scripts)
      .filter((property) => property.name === name)
      .map((property) => property.sourceOffset),
  );
  for (const script of scripts) {
    const text = snapshot.getText(script.start, script.end);
    const methods = scanRiotV3MethodProperties(text, script.start);
    for (const method of methods) {
      if (method.name === name) {
        declarationOffsets.add(method.sourceOffset);
      }
    }
    for (const property of scanInstancePropertyOccurrences(
      text,
      script.start,
      aliases,
    )) {
      if (property.name === name) {
        addOccurrence(occurrences, {
          start: property.sourceOffset,
          end: property.sourceOffset + property.name.length,
          role: declarationOffsets.has(property.sourceOffset)
            ? 'declaration'
            : getInstancePropertyRole(
                text,
                property.sourceOffset - script.start,
                property.name.length,
              ),
        });
      }
    }
    for (const method of methods) {
      if (method.name === name) {
        addOccurrence(occurrences, {
          start: method.sourceOffset,
          end: method.sourceOffset + method.name.length,
          role: 'declaration',
        });
      }
    }
  }
  return occurrences;
}

function getInstancePropertyRole(
  text: string,
  propertyOffset: number,
  propertyLength: number,
): NavigationOccurrence['role'] {
  let cursor = propertyOffset + propertyLength;
  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor++;
  }
  return isAssignmentOperatorAt(text, cursor) ? 'write' : 'read';
}

function isAssignmentOperatorAt(text: string, offset: number): boolean {
  return [
    '=',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '**=',
    '&&=',
    '||=',
    '??=',
    '&=',
    '|=',
    '^=',
    '++',
    '--',
  ].some((operator) => text.startsWith(operator, offset));
}

function addOccurrence(
  occurrences: NavigationOccurrence[],
  occurrence: NavigationOccurrence,
): void {
  const existingIndex = occurrences.findIndex(
    (candidate) =>
      candidate.start === occurrence.start && candidate.end === occurrence.end,
  );
  if (existingIndex === -1) {
    occurrences.push(occurrence);
    return;
  }
  if (
    getOccurrencePriority(occurrence.role) >
    getOccurrencePriority(occurrences[existingIndex].role)
  ) {
    occurrences[existingIndex] = occurrence;
  }
}

function getOccurrencePriority(role: NavigationOccurrence['role']): number {
  if (role === 'declaration') {
    return 2;
  }
  return role === 'write' ? 1 : 0;
}

function shouldRenameTemplateIdentifier(
  expression: TemplateExpression,
  offset: number,
  identifier: string,
): boolean {
  if (expression.localNames.includes(identifier)) {
    return false;
  }
  if (shouldPrefixTemplateIdentifier(expression.text, offset, identifier)) {
    return true;
  }
  const previous = findPreviousNonWhitespace(expression.text, offset - 1);
  if (previous !== '.') {
    return false;
  }
  const qualifier = getPreviousIdentifier(expression.text, offset - 1);
  return (
    qualifier === 'this' ||
    (expression.eachDepth !== undefined && qualifier === 'parent')
  );
}

function getPreviousIdentifier(
  text: string,
  beforeOffset: number,
): string | undefined {
  let cursor = beforeOffset;
  while (cursor >= 0 && /\s/.test(text[cursor])) {
    cursor--;
  }
  if (text[cursor] !== '.') {
    return;
  }
  cursor--;
  while (cursor >= 0 && /\s/.test(text[cursor])) {
    cursor--;
  }
  const end = cursor + 1;
  while (cursor >= 0 && isIdentifierPart(text[cursor])) {
    cursor--;
  }
  if (cursor + 1 < end) {
    return text.slice(cursor + 1, end);
  }
}
