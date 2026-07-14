import type { VirtualCode } from '@volar/language-core';
import type * as ts from 'typescript';
import type * as html from 'vscode-html-languageservice';
import {
  findPreviousNonWhitespace,
  isIdentifierPart,
  isIdentifierStart,
  isInRanges,
  scanBalanced,
  scanJavaScriptNonCode,
  scanString,
  scanTemplateNonIdentifier,
} from './scanners';
import type { GeneratedSegment, TextRange } from './types';

const riotV3ScriptContextSuffix = `
}
`;
type TemplateExpressionKind = 'expression';

export interface TemplateExpression {
  kind: TemplateExpressionKind;
  sourceOffset: number;
  text: string;
  localNames: string[];
  localDefinitions: EachLocalName[];
  eachDepth: number | undefined;
}

export interface EachScope {
  start: number;
  end: number;
  sourceOffset: number;
  depth: number;
  localNames: EachLocalName[];
}

export interface EachLocalName {
  name: string;
  sourceOffset: number;
  kind: 'item' | 'index';
  collectionOffset: number;
  collectionText: string;
  collectionLocalNames: string[];
}

export interface TemplateAnalysis {
  expressions: TemplateExpression[];
  eachScopes: EachScope[];
  eachDepthCount: number;
}

interface AttributeExpression {
  sourceOffset: number;
  text: string;
}

interface EachExpression {
  localNames: EachLocalName[];
  collectionOffset: number;
  collectionText: string;
}

export function createTemplateAnalysis(
  snapshot: ts.IScriptSnapshot,
  htmlNodes: html.Node[],
  ignoredRanges: TextRange[],
  range: { start: number; end: number },
): TemplateAnalysis {
  const sourceText = snapshot.getText(0, snapshot.getLength());
  const eachScopes = getEachScopes(sourceText, htmlNodes);
  return {
    expressions: getTemplateExpressionsForSource(
      sourceText,
      eachScopes,
      ignoredRanges,
      range,
    ),
    eachScopes,
    eachDepthCount: getEachDepthCountForScopes(eachScopes),
  };
}

function getTemplateExpressionsForSource(
  sourceText: string,
  eachScopes: EachScope[],
  ignoredRanges: TextRange[],
  range: { start: number; end: number },
): TemplateExpression[] {
  const expressions: TemplateExpression[] = [];

  for (let offset = range.start; offset < range.end; offset++) {
    if (sourceText[offset] !== '{' || isInRanges(offset, ignoredRanges)) {
      continue;
    }

    const end = findTemplateExpressionEnd(sourceText, offset);
    if (end === undefined) {
      continue;
    }

    const innerStart = offset + 1;
    const innerEnd = end;
    const leadingWhitespace =
      sourceText.slice(innerStart, innerEnd).match(/^\s*/)?.[0].length ?? 0;
    const trailingWhitespace =
      sourceText.slice(innerStart, innerEnd).match(/\s*$/)?.[0].length ?? 0;
    const textStart = innerStart + leadingWhitespace;
    const textEnd = innerEnd - trailingWhitespace;
    const expressionText = sourceText.slice(textStart, textEnd);
    const attributeName = getAttributeNameBeforeExpression(sourceText, offset);
    if (attributeName === 'each') {
      const eachExpression = parseEachExpression(expressionText, textStart);
      if (eachExpression) {
        expressions.push({
          kind: 'expression',
          sourceOffset: eachExpression.collectionOffset,
          text: eachExpression.collectionText,
          localNames: getLocalNamesForOffset(
            eachExpression.collectionOffset,
            eachScopes,
            textStart,
          ),
          localDefinitions: getLocalDefinitionsForOffset(
            eachExpression.collectionOffset,
            eachScopes,
            textStart,
          ),
          eachDepth: getEachDepthForOffset(
            eachExpression.collectionOffset,
            eachScopes,
            textStart,
          ),
        });
      }
      offset = end;
      continue;
    }
    if (attributeName === 'class') {
      const classExpressions = parseClassShorthandExpressions(
        expressionText,
        textStart,
      );
      if (classExpressions.length) {
        for (const classExpression of classExpressions) {
          expressions.push({
            kind: 'expression',
            sourceOffset: classExpression.sourceOffset,
            text: classExpression.text,
            localNames: getLocalNamesForOffset(
              classExpression.sourceOffset,
              eachScopes,
            ),
            localDefinitions: getLocalDefinitionsForOffset(
              classExpression.sourceOffset,
              eachScopes,
            ),
            eachDepth: getEachDepthForOffset(
              classExpression.sourceOffset,
              eachScopes,
            ),
          });
        }
        offset = end;
        continue;
      }
    }
    expressions.push({
      kind: 'expression',
      sourceOffset: textStart,
      text: expressionText,
      localNames: getLocalNamesForOffset(textStart, eachScopes),
      localDefinitions: getLocalDefinitionsForOffset(textStart, eachScopes),
      eachDepth: getEachDepthForOffset(textStart, eachScopes),
    });
    offset = end;
  }

  return expressions;
}

function getEachScopes(
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
    scopes.push({
      start: node.start,
      end: node.end,
      sourceOffset: eachAttribute.sourceOffset,
      depth: getContainingEachScopes(node.start, scopes).length,
      localNames: eachExpression.localNames.map((localName) => ({
        ...localName,
        collectionLocalNames,
      })),
    });
  }
  return scopes;
}

function getEachDepthCountForScopes(scopes: EachScope[]): number {
  return scopes.reduce(
    (maxDepth, scope) => Math.max(maxDepth, scope.depth + 1),
    0,
  );
}

function findAttributeExpression(
  sourceText: string,
  node: html.Node,
  attributeName: string,
): AttributeExpression | undefined {
  if (node.startTagEnd === undefined) {
    return;
  }

  const startTagText = sourceText.slice(node.start, node.startTagEnd);
  for (let offset = 0; offset < startTagText.length; ) {
    const char = startTagText[offset];
    if (char === "'" || char === '"') {
      offset = scanString(startTagText, offset);
      continue;
    }
    if (
      char !== attributeName[0] ||
      !matchesAttributeName(startTagText, offset, attributeName)
    ) {
      offset++;
      continue;
    }

    let cursor = offset + attributeName.length;
    while (cursor < startTagText.length && /\s/.test(startTagText[cursor])) {
      cursor++;
    }
    if (startTagText[cursor] !== '=') {
      offset = cursor;
      continue;
    }
    cursor++;
    while (cursor < startTagText.length && /\s/.test(startTagText[cursor])) {
      cursor++;
    }
    if (startTagText[cursor] !== '{') {
      offset = cursor;
      continue;
    }

    const sourceExpressionStart = node.start + cursor;
    const sourceExpressionEnd = findTemplateExpressionEnd(
      sourceText,
      sourceExpressionStart,
    );
    if (sourceExpressionEnd === undefined) {
      return;
    }

    const innerStart = sourceExpressionStart + 1;
    const leadingWhitespace =
      sourceText.slice(innerStart, sourceExpressionEnd).match(/^\s*/)?.[0]
        .length ?? 0;
    const trailingWhitespace =
      sourceText.slice(innerStart, sourceExpressionEnd).match(/\s*$/)?.[0]
        .length ?? 0;
    const textStart = innerStart + leadingWhitespace;
    const textEnd = sourceExpressionEnd - trailingWhitespace;
    return {
      sourceOffset: textStart,
      text: sourceText.slice(textStart, textEnd),
    };
  }
}

function matchesAttributeName(
  text: string,
  offset: number,
  attributeName: string,
): boolean {
  if (
    text.slice(offset, offset + attributeName.length).toLowerCase() !==
    attributeName
  ) {
    return false;
  }
  return (
    !/[-\w:]/.test(text[offset - 1] ?? '') &&
    !/[-\w:]/.test(text[offset + attributeName.length] ?? '')
  );
}

function parseEachExpression(
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

function parseClassShorthandExpressions(
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

function getLocalNamesForOffset(
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

function getLocalDefinitionsForOffset(
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

function getEachDepthForOffset(
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

function getContainingEachScopes(
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

export function createTemplateVirtualCode(
  id: string,
  expressions: TemplateExpression[],
  typeNames: { templateInstance: string; eachContext: string },
): VirtualCode {
  const segments: GeneratedSegment[] = [
    { text: getTemplateContextPrefix(typeNames.templateInstance) },
  ];
  for (const expression of expressions) {
    const eachContext =
      expression.eachDepth === undefined
        ? undefined
        : getNestedEachContextTypeName(
            typeNames.eachContext,
            expression.eachDepth,
          );
    segments.push({
      text: eachContext ? `{\n(function(this: ${eachContext}) {\n` : '{\n',
    });
    segments.push(
      ...generateEachLocalDeclarationSegments(
        getUsedEachLocalDefinitions(expression),
      ),
    );
    segments.push({ text: 'void (' });
    segments.push(...generateTemplateExpressionSegments(expression));
    segments.push({ text: eachContext ? ');\n});\n}\n' : ');\n}\n' });
  }
  segments.push({ text: riotV3ScriptContextSuffix });

  let generatedText = '';
  const sourceOffsets: number[] = [];
  const generatedOffsets: number[] = [];
  const lengths: number[] = [];
  const generatedLengths: number[] = [];
  const completionSourceOffsets: number[] = [];
  const completionGeneratedOffsets: number[] = [];
  const completionLengths: number[] = [];
  const completionGeneratedLengths: number[] = [];

  for (const segment of segments) {
    const generatedOffset = generatedText.length;
    generatedText += segment.text;
    if (segment.sourceOffset !== undefined && segment.length !== undefined) {
      if (segment.data) {
        completionSourceOffsets.push(segment.sourceOffset);
        completionGeneratedOffsets.push(generatedOffset);
        completionLengths.push(segment.length);
        completionGeneratedLengths.push(
          segment.generatedLength ?? segment.length,
        );
      } else {
        sourceOffsets.push(segment.sourceOffset);
        generatedOffsets.push(generatedOffset);
        lengths.push(segment.length);
        generatedLengths.push(segment.generatedLength ?? segment.length);
      }
    }
  }

  return {
    id,
    languageId: 'typescript',
    snapshot: {
      getText: (start, end) => generatedText.substring(start, end),
      getLength: () => generatedText.length,
      getChangeRange: () => undefined,
    },
    mappings: [
      ...(completionSourceOffsets.length
        ? [
            {
              sourceOffsets: completionSourceOffsets,
              generatedOffsets: completionGeneratedOffsets,
              lengths: completionLengths,
              generatedLengths: completionGeneratedLengths,
              data: {
                completion: true,
                format: false,
                navigation: false,
                semantic: false,
                structure: false,
                verification: false,
              },
            },
          ]
        : []),
      ...(sourceOffsets.length
        ? [
            {
              sourceOffsets,
              generatedOffsets,
              lengths,
              generatedLengths,
              data: {
                completion: true,
                format: false,
                navigation: false,
                semantic: true,
                structure: true,
                verification: true,
              },
            },
          ]
        : []),
    ],
    embeddedCodes: [],
  };
}

function getUsedEachLocalDefinitions(
  expression: TemplateExpression,
): EachLocalName[] {
  const visibleDefinitions = getVisibleEachLocalDefinitions(expression);
  const usedDefinitions = new Map<number, EachLocalName>();
  addUsedEachLocalDefinitions(
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

export function getResolvedEachLocalName(
  expression: TemplateExpression,
  offset: number,
  identifier: string,
): EachLocalName | undefined {
  if (!expression.localNames.includes(identifier)) {
    return;
  }
  const previous = findPreviousNonWhitespace(expression.text, offset - 1);
  if (previous === '.') {
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

function addUsedEachLocalDefinitions(
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
    if (!localName || usedDefinitions.has(localName.sourceOffset)) {
      continue;
    }
    usedDefinitions.set(localName.sourceOffset, localName);
    addUsedEachLocalDefinitions(
      localName.collectionText,
      localName.collectionOffset,
      localName.collectionLocalNames,
      localDefinitions,
      usedDefinitions,
    );
  }
}

function generateEachLocalDeclarationSegments(
  localNames: EachLocalName[],
): GeneratedSegment[] {
  const segments: GeneratedSegment[] = [];
  const collectionNames = new Map<string, string>();
  for (const localName of localNames) {
    const collectionKey =
      localName.collectionOffset + '\0' + localName.collectionText;
    let collectionName = collectionNames.get(collectionKey);
    if (!collectionName) {
      collectionName = `__riot_v3_each_collection_${collectionNames.size}`;
      collectionNames.set(collectionKey, collectionName);
      segments.push({ text: `const ${collectionName} = ` });
      segments.push(
        ...generateTemplateExpressionSegments({
          kind: 'expression',
          sourceOffset: localName.collectionOffset,
          text: localName.collectionText,
          localNames: localName.collectionLocalNames,
          localDefinitions: [],
          eachDepth: undefined,
        }),
      );
      segments.push({ text: ';\n' });
    }
    const helper =
      localName.kind === 'item' ? 'RiotV3EachItem' : 'RiotV3EachIndex';
    segments.push({ text: 'const ' });
    segments.push({
      text: localName.name,
      sourceOffset: localName.sourceOffset,
      length: localName.name.length,
    });
    segments.push({
      text: ` = undefined as unknown as ${helper}<typeof ${collectionName}>;\n`,
    });
  }
  return segments;
}

function generateTemplateExpressionSegments(
  expression: TemplateExpression,
): GeneratedSegment[] {
  const segments: GeneratedSegment[] = [];
  const text = expression.text;
  if (!text) {
    segments.push(createTemplateCompletionSegment(expression.sourceOffset));
    return segments;
  }

  for (let offset = 0; offset < text.length; ) {
    const char = text[offset];
    if (isIdentifierStart(char)) {
      const start = offset;
      offset++;
      while (offset < text.length && isIdentifierPart(text[offset])) {
        offset++;
      }
      const identifier = text.slice(start, offset);
      if (expression.localNames.includes(identifier)) {
        segments.push({
          text: identifier,
          sourceOffset: expression.sourceOffset + start,
          length: identifier.length,
        });
      } else if (
        shouldMaskTemplateIdentifier(
          text,
          start,
          identifier,
          expression.eachDepth !== undefined,
        )
      ) {
        segments.push({
          text: '({} as any)',
          sourceOffset: expression.sourceOffset + start,
          length: identifier.length,
        });
      } else if (shouldPrefixTemplateIdentifier(text, start, identifier)) {
        segments.push({ text: 'this.' });
        segments.push({
          text: identifier,
          sourceOffset: expression.sourceOffset + start,
          length: identifier.length,
        });
      } else {
        segments.push({
          text: identifier,
          sourceOffset: expression.sourceOffset + start,
          length: identifier.length,
        });
      }
      continue;
    }

    const skipped = scanTemplateNonIdentifier(text, offset);
    segments.push({ text: text.slice(offset, skipped) });
    offset = skipped;
  }

  return segments;
}

function getNestedEachContextTypeName(baseName: string, depth: number): string {
  return depth === 0 ? baseName : `${baseName}_${depth}`;
}

function createTemplateCompletionSegment(
  sourceOffset: number,
): GeneratedSegment {
  return {
    text: 'this.',
    sourceOffset,
    length: 0,
    generatedLength: 'this.'.length,
    data: {
      completion: true,
      format: false,
      navigation: false,
      semantic: false,
      structure: false,
      verification: false,
    },
  };
}

function shouldMaskTemplateIdentifier(
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

function getTemplateContextPrefix(instanceTypeName: string): string {
  return `function __riot_v3_template_context(this: ${instanceTypeName}) {
`;
}

function findTemplateExpressionEnd(
  text: string,
  start: number,
): number | undefined {
  let depth = 0;
  for (let offset = start; offset < text.length; ) {
    const char = text[offset];
    const skipped = scanJavaScriptNonCode(text, offset);
    if (skipped !== undefined) {
      offset = skipped;
      continue;
    }
    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return offset;
      }
    }
    offset++;
  }
}

function getAttributeNameBeforeExpression(
  text: string,
  offset: number,
): string | undefined {
  let cursor = offset - 1;
  while (cursor >= 0 && /\s/.test(text[cursor])) {
    cursor--;
  }
  if (text[cursor] !== '=') {
    return;
  }
  cursor--;
  while (cursor >= 0 && /\s/.test(text[cursor])) {
    cursor--;
  }
  const end = cursor + 1;
  while (cursor >= 0 && /[-\w:]/.test(text[cursor])) {
    cursor--;
  }
  if (cursor + 1 < end) {
    return text.slice(cursor + 1, end).toLowerCase();
  }
}
