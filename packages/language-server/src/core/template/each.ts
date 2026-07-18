import type * as html from 'vscode-html-languageservice';
import {
  findPreviousNonWhitespace,
  isIdentifierPart,
  isIdentifierStart,
  scanBalanced,
  scanJavaScriptNonCode,
  scanTemplateNonIdentifier,
} from '../scanners';
import {
  type AttributeExpression,
  findAttributeExpression,
} from './attributes';
import type { EachLocalName, EachScope, TemplateExpression } from './types';

interface EachExpression {
  kind: 'shorthand' | 'explicit';
  localNames: EachLocalName[];
  collectionOffset: number;
  collectionText: string;
}

export function getEachScopes(
  sourceText: string,
  htmlNodes: html.Node[],
): EachScope[] {
  const scopes: EachScope[] = [];
  const eachNodes = htmlNodes
    .map((node) => ({
      node,
      eachAttribute: findAttributeExpression(sourceText, node, 'each'),
    }))
    .filter(
      (
        entry,
      ): entry is { node: html.Node; eachAttribute: AttributeExpression } =>
        entry.eachAttribute !== undefined,
    )
    .sort((a, b) => a.node.start - b.node.start || b.node.end - a.node.end);
  for (const { node, eachAttribute } of eachNodes) {
    const eachExpression = parseEachExpression(
      eachAttribute.text,
      eachAttribute.sourceOffset,
    );
    if (!eachExpression) {
      continue;
    }

    const collectionLocalNames = getLocalNamesForOffset(
      eachExpression.collectionOffset,
      scopes,
    );
    const collectionLocalDefinitions = getLocalDefinitionsForOffset(
      eachExpression.collectionOffset,
      scopes,
    );
    const collectionEachDepth = getEachDepthForOffset(
      eachExpression.collectionOffset,
      scopes,
    );
    scopes.push({
      kind: eachExpression.kind,
      start: node.start,
      end: node.end,
      sourceOffset: eachAttribute.sourceOffset,
      collectionOffset: eachExpression.collectionOffset,
      collectionText: eachExpression.collectionText,
      collectionLocalNames,
      collectionLocalDefinitions,
      collectionEachDepth,
      depth: getContainingEachScopes(node.start, scopes).length,
      localNames: eachExpression.localNames.map((localName) => ({
        ...localName,
        collectionLocalNames,
      })),
    });
  }
  return scopes;
}

export function createEachCollectionExpression(
  scope: EachScope,
): TemplateExpression {
  return {
    kind: 'expression',
    sourceOffset: scope.collectionOffset,
    text: scope.collectionText,
    localNames: scope.collectionLocalNames,
    localDefinitions: scope.collectionLocalDefinitions,
    eachDepth: scope.collectionEachDepth,
    excludedEachScopeSourceOffset: scope.sourceOffset,
  };
}

export function parseEachExpression(
  text: string,
  sourceOffset: number,
): EachExpression | undefined {
  const trimmedStart = text.match(/^\s*/)?.[0].length ?? 0;
  const trimmedEnd = text.length - (text.match(/\s*$/)?.[0].length ?? 0);
  if (trimmedStart >= trimmedEnd) {
    return;
  }

  const trimmedText = text.slice(trimmedStart, trimmedEnd);
  const trimmedSourceOffset = sourceOffset + trimmedStart;
  const separator = findEachInSeparator(trimmedText);
  if (!separator) {
    return {
      kind: 'shorthand',
      localNames: [],
      collectionOffset: trimmedSourceOffset,
      collectionText: trimmedText,
    };
  }

  const left = trimmedText.slice(0, separator.start);
  const right = trimmedText.slice(separator.end);
  const localNames = parseEachLocalNames(left, trimmedSourceOffset);
  const collectionLeadingWhitespace = right.match(/^\s*/)?.[0].length ?? 0;
  const collectionTrailingWhitespace = right.match(/\s*$/)?.[0].length ?? 0;
  const collectionText = right.slice(
    collectionLeadingWhitespace,
    right.length - collectionTrailingWhitespace,
  );
  if (!collectionText) {
    return;
  }
  const collectionOffset =
    trimmedSourceOffset + separator.end + collectionLeadingWhitespace;

  return {
    kind: 'explicit',
    localNames: localNames.map((localName, index) => ({
      ...localName,
      kind: index === 0 ? 'item' : 'index',
      collectionOffset,
      collectionText,
      collectionLocalNames: [],
    })),
    collectionOffset,
    collectionText,
  };
}

function findEachInSeparator(
  text: string,
): { start: number; end: number } | undefined {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  for (let offset = 0; offset < text.length; ) {
    const char = text[offset];
    const skipped = scanJavaScriptNonCode(text, offset);
    if (skipped !== undefined) {
      offset = skipped;
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
    } else if (
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      text.startsWith('in', offset) &&
      /\s/.test(text[offset - 1] ?? '') &&
      /\s/.test(text[offset + 'in'.length] ?? '')
    ) {
      return {
        start: offset,
        end: offset + 'in'.length,
      };
    }
    offset++;
  }
}

function parseEachLocalNames(
  text: string,
  sourceOffset: number,
): EachLocalName[] {
  let localText = text;
  let localSourceOffset = sourceOffset;
  const leadingWhitespace = localText.match(/^\s*/)?.[0].length ?? 0;
  const trailingWhitespace = localText.match(/\s*$/)?.[0].length ?? 0;
  localText = localText.slice(
    leadingWhitespace,
    localText.length - trailingWhitespace,
  );
  localSourceOffset += leadingWhitespace;

  if (localText[0] === '(' && localText[localText.length - 1] === ')') {
    const end = scanBalanced(localText, 0, '(', ')');
    if (end === localText.length) {
      localText = localText.slice(1, -1);
      localSourceOffset++;
    }
  }

  const localNames: EachLocalName[] = [];
  let segmentStart = 0;
  while (segmentStart <= localText.length) {
    const comma = localText.indexOf(',', segmentStart);
    const segmentEnd = comma === -1 ? localText.length : comma;
    const candidate = localText.slice(segmentStart, segmentEnd);
    const candidateLeadingWhitespace = candidate.match(/^\s*/)?.[0].length ?? 0;
    const candidateTrailingWhitespace =
      candidate.match(/\s*$/)?.[0].length ?? 0;
    const name = candidate.slice(
      candidateLeadingWhitespace,
      candidate.length - candidateTrailingWhitespace,
    );
    if (
      isValidIdentifier(name) &&
      !localNames.some((localName) => localName.name === name)
    ) {
      localNames.push({
        name,
        sourceOffset:
          localSourceOffset + segmentStart + candidateLeadingWhitespace,
        kind: localNames.length === 0 ? 'item' : 'index',
        collectionOffset: sourceOffset,
        collectionText: '',
        collectionLocalNames: [],
      });
    }
    if (comma === -1) {
      break;
    }
    segmentStart = comma + 1;
  }
  return localNames;
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

export function getLocalNamesForOffset(
  offset: number,
  scopes: EachScope[],
  excludedScopeSourceOffset?: number,
): string[] {
  const localNames: string[] = [];
  for (const scope of getContainingEachScopes(
    offset,
    scopes,
    excludedScopeSourceOffset,
  )) {
    for (const localName of scope.localNames) {
      if (!localNames.includes(localName.name)) {
        localNames.push(localName.name);
      }
    }
  }
  return localNames;
}

export function getLocalDefinitionsForOffset(
  offset: number,
  scopes: EachScope[],
  excludedScopeSourceOffset?: number,
): EachLocalName[] {
  return getContainingEachScopes(
    offset,
    scopes,
    excludedScopeSourceOffset,
  ).flatMap((scope) => scope.localNames);
}

export function getEachDepthForOffset(
  offset: number,
  scopes: EachScope[],
  excludedScopeSourceOffset?: number,
): number | undefined {
  const stack = getContainingEachScopes(
    offset,
    scopes,
    excludedScopeSourceOffset,
  );
  return stack.at(-1)?.depth;
}

export function getContainingEachScopes(
  offset: number,
  scopes: EachScope[],
  excludedScopeSourceOffset?: number,
): EachScope[] {
  return scopes
    .filter(
      (scope) =>
        scope.sourceOffset !== excludedScopeSourceOffset &&
        offset >= scope.start &&
        offset < scope.end,
    )
    .sort((a, b) => a.depth - b.depth || a.start - b.start);
}

export function getUsedBareEachLocalDefinitions(
  expression: TemplateExpression,
): EachLocalName[] {
  const visibleDefinitions = getVisibleEachLocalDefinitions(expression);
  const usedDefinitions = new Map<number, EachLocalName>();
  addUsedBareEachLocalDefinitions(
    expression.text,
    expression.sourceOffset,
    expression.localNames,
    visibleDefinitions,
    usedDefinitions,
  );
  return visibleDefinitions.filter((localName) =>
    usedDefinitions.has(localName.sourceOffset),
  );
}

export function getUsedEachLocalDefinitionOffsets(
  expressions: TemplateExpression[],
): Set<number> {
  const offsets = new Set<number>();
  for (const expression of expressions) {
    const text = expression.text;
    for (let offset = 0; offset < text.length; ) {
      if (!isIdentifierStart(text[offset])) {
        offset = scanTemplateNonIdentifier(text, offset);
        continue;
      }
      const start = offset;
      offset++;
      while (offset < text.length && isIdentifierPart(text[offset])) {
        offset++;
      }
      const localName = getResolvedEachLocalName(
        expression,
        start,
        text.slice(start, offset),
      );
      if (localName) {
        offsets.add(localName.sourceOffset);
      }
    }
  }
  return offsets;
}

export function getResolvedEachLocalName(
  expression: TemplateExpression,
  offset: number,
  identifier: string,
): EachLocalName | undefined {
  if (!expression.localNames.includes(identifier)) {
    return;
  }
  const qualifier = getPropertyQualifier(expression.text, offset);
  if (qualifier !== undefined && qualifier !== 'this') {
    return;
  }
  for (
    let index = expression.localDefinitions.length - 1;
    index >= 0;
    index--
  ) {
    const localName = expression.localDefinitions[index];
    if (localName.name === identifier) {
      return localName;
    }
  }
}

function getVisibleEachLocalDefinitions(
  expression: TemplateExpression,
): EachLocalName[] {
  const definitions: EachLocalName[] = [];
  for (const localName of expression.localDefinitions) {
    const existingIndex = definitions.findIndex(
      (definition) => definition.name === localName.name,
    );
    if (existingIndex === -1) {
      definitions.push(localName);
    } else {
      definitions[existingIndex] = localName;
    }
  }
  return definitions;
}

function addUsedBareEachLocalDefinitions(
  text: string,
  sourceOffset: number,
  localNames: string[],
  localDefinitions: EachLocalName[],
  usedDefinitions: Map<number, EachLocalName>,
): void {
  const expression: TemplateExpression = {
    kind: 'expression',
    sourceOffset,
    text,
    localNames,
    localDefinitions,
    eachDepth: undefined,
  };
  for (let offset = 0; offset < text.length; ) {
    const char = text[offset];
    if (!isIdentifierStart(char)) {
      offset = scanTemplateNonIdentifier(text, offset);
      continue;
    }
    const start = offset;
    offset++;
    while (offset < text.length && isIdentifierPart(text[offset])) {
      offset++;
    }
    const identifier = text.slice(start, offset);
    const localName = getResolvedEachLocalName(expression, start, identifier);
    if (
      !localName ||
      getPropertyQualifier(text, start) === 'this' ||
      usedDefinitions.has(localName.sourceOffset)
    ) {
      continue;
    }
    usedDefinitions.set(localName.sourceOffset, localName);
    addUsedBareEachLocalDefinitions(
      localName.collectionText,
      localName.collectionOffset,
      localName.collectionLocalNames,
      localDefinitions,
      usedDefinitions,
    );
  }
}

function getPropertyQualifier(
  text: string,
  offset: number,
): string | undefined {
  const previous = findPreviousNonWhitespace(text, offset - 1);
  if (previous !== '.') {
    return;
  }
  let cursor = offset - 1;
  while (cursor >= 0 && /\s/.test(text[cursor])) {
    cursor--;
  }
  cursor--;
  while (cursor >= 0 && /\s/.test(text[cursor])) {
    cursor--;
  }
  const end = cursor + 1;
  while (cursor >= 0 && isIdentifierPart(text[cursor])) {
    cursor--;
  }
  return text.slice(cursor + 1, end);
}
