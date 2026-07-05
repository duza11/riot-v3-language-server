import type * as ts from 'typescript';
import * as html from 'vscode-html-languageservice';
import { getRiotV3Components, getTemplateIgnoredRanges } from './components';
import {
  findPreviousNonWhitespace,
  isIdentifierPart,
  isIdentifierStart,
  scanTemplateNonIdentifier,
} from './scanners';
import {
  getScriptProperties,
  getScriptThisAliases,
  scanInstanceProperties,
  scanRiotV3MethodProperties,
} from './script';
import {
  createTemplateAnalysis,
  type EachLocalName,
  type EachScope,
  getResolvedEachLocalName,
  shouldPrefixTemplateIdentifier,
  type TemplateAnalysis,
  type TemplateExpression,
} from './template';
import type {
  RiotV3Component,
  RiotV3ReferenceRange,
  RiotV3RenameRange,
  RiotV3RenameTextEdit,
  ScriptBlock,
  ScriptProperty,
} from './types';

const htmlLs = html.getLanguageService();
function createScriptSnapshot(sourceText: string): ts.IScriptSnapshot {
  return {
    getText: (start, end) => sourceText.slice(start, end),
    getLength: () => sourceText.length,
    getChangeRange: () => undefined,
  };
}

export function getRiotV3RenameEdits(
  sourceText: string,
  position: number,
  newName: string,
): RiotV3RenameTextEdit[] {
  const context = getNavigationContext(sourceText, position);
  if (!context) {
    return [];
  }
  const { identifier, snapshot, component, templateAnalysis } = context;

  const eachLocal = getEachLocalRenameTarget(
    identifier,
    templateAnalysis.expressions,
    templateAnalysis.eachScopes,
  );
  if (eachLocal) {
    return getEachLocalRenameOffsets(
      eachLocal,
      templateAnalysis.expressions,
    ).map((offset) => ({
      start: offset,
      end: offset + eachLocal.name.length,
      newText: newName,
    }));
  }

  const scriptProperties = getScriptProperties(snapshot, component.scripts);
  if (
    !isRiotPropertyRenameSource(
      sourceText,
      identifier,
      scriptProperties,
      snapshot,
      component,
      templateAnalysis,
    )
  ) {
    return [];
  }

  return getRiotPropertyReferenceOffsets(
    snapshot,
    component,
    templateAnalysis.expressions,
    identifier.name,
  ).map((offset) => ({
    start: offset,
    end: offset + identifier.name.length,
    newText: newName,
  }));
}

export function getRiotV3ReferenceRanges(
  sourceText: string,
  position: number,
): RiotV3ReferenceRange[] {
  const context = getNavigationContext(sourceText, position);
  if (!context) {
    return [];
  }
  const { identifier, snapshot, component, templateAnalysis } = context;

  const eachLocal = getEachLocalRenameTarget(
    identifier,
    templateAnalysis.expressions,
    templateAnalysis.eachScopes,
  );
  if (eachLocal) {
    return getEachLocalRenameOffsets(
      eachLocal,
      templateAnalysis.expressions,
    ).map((offset) => ({
      start: offset,
      end: offset + eachLocal.name.length,
    }));
  }

  const scriptProperties = getScriptProperties(snapshot, component.scripts);
  if (
    !isRiotPropertyRenameSource(
      sourceText,
      identifier,
      scriptProperties,
      snapshot,
      component,
      templateAnalysis,
    )
  ) {
    return [];
  }
  return getRiotPropertyReferenceOffsets(
    snapshot,
    component,
    templateAnalysis.expressions,
    identifier.name,
  ).map((offset) => ({
    start: offset,
    end: offset + identifier.name.length,
  }));
}

export function getRiotV3RenameRange(
  sourceText: string,
  position: number,
): RiotV3RenameRange | undefined {
  const context = getNavigationContext(sourceText, position);
  if (!context) {
    return;
  }
  const { identifier, snapshot, component, templateAnalysis } = context;

  if (
    getEachLocalRenameTarget(
      identifier,
      templateAnalysis.expressions,
      templateAnalysis.eachScopes,
    )
  ) {
    return {
      start: identifier.start,
      end: identifier.end,
    };
  }

  const scriptProperties = getScriptProperties(snapshot, component.scripts);
  if (
    isRiotPropertyRenameSource(
      sourceText,
      identifier,
      scriptProperties,
      snapshot,
      component,
      templateAnalysis,
    )
  ) {
    return {
      start: identifier.start,
      end: identifier.end,
    };
  }
}

interface NavigationContext {
  identifier: IdentifierRange;
  snapshot: ts.IScriptSnapshot;
  component: RiotV3Component;
  templateAnalysis: TemplateAnalysis;
}

function getNavigationContext(
  sourceText: string,
  position: number,
): NavigationContext | undefined {
  const identifier = getIdentifierAtOffset(sourceText, position);
  if (!identifier) {
    return;
  }

  const snapshot = createScriptSnapshot(sourceText);
  const htmlDocument = htmlLs.parseHTMLDocument(
    html.TextDocument.create('', 'html', 0, sourceText),
  );
  const components = getRiotV3Components(sourceText.length, htmlDocument);
  const component = getComponentAtOffset(components, position);
  if (!component) {
    return;
  }

  return {
    identifier,
    snapshot,
    component,
    templateAnalysis: createTemplateAnalysis(
      snapshot,
      component.nodes,
      getTemplateIgnoredRanges(component),
      {
        start: component.start,
        end: component.end,
      },
    ),
  };
}

function getComponentAtOffset(
  components: RiotV3Component[],
  offset: number,
): RiotV3Component | undefined {
  return components.find(
    (component) => offset >= component.start && offset <= component.end,
  );
}

function isRiotPropertyRenameSource(
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

interface IdentifierRange {
  name: string;
  start: number;
  end: number;
}

function getIdentifierAtOffset(
  text: string,
  offset: number,
): IdentifierRange | undefined {
  let cursor = offset;
  if (
    !isIdentifierPart(text[cursor] ?? '') &&
    cursor > 0 &&
    isIdentifierPart(text[cursor - 1] ?? '')
  ) {
    cursor--;
  }
  if (!isIdentifierPart(text[cursor] ?? '')) {
    return;
  }
  let start = cursor;
  while (start > 0 && isIdentifierPart(text[start - 1])) {
    start--;
  }
  if (!isIdentifierStart(text[start])) {
    return;
  }
  let end = cursor + 1;
  while (end < text.length && isIdentifierPart(text[end])) {
    end++;
  }
  return {
    name: text.slice(start, end),
    start,
    end,
  };
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

function getRiotPropertyReferenceOffsets(
  snapshot: ts.IScriptSnapshot,
  component: RiotV3Component,
  expressions: TemplateExpression[],
  name: string,
): number[] {
  const offsets: number[] = [];
  for (const offset of getScriptRenameOffsets(
    snapshot,
    component.scripts,
    name,
  )) {
    if (!offsets.includes(offset)) {
      offsets.push(offset);
    }
  }
  for (const expression of expressions) {
    for (const offset of getTemplateRenameOffsets(expression, name)) {
      if (!offsets.includes(offset)) {
        offsets.push(offset);
      }
    }
  }
  return offsets;
}

function getEachLocalRenameTarget(
  identifier: IdentifierRange,
  expressions: TemplateExpression[],
  scopes: EachScope[],
): EachLocalName | undefined {
  for (const scope of scopes) {
    for (const localName of scope.localNames) {
      if (
        identifier.name === localName.name &&
        identifier.start >= localName.sourceOffset &&
        identifier.end <= localName.sourceOffset + localName.name.length
      ) {
        return localName;
      }
    }
  }

  const expression = expressions.find(
    (expression) =>
      identifier.start >= expression.sourceOffset &&
      identifier.end <= expression.sourceOffset + expression.text.length,
  );
  if (!expression) {
    return;
  }
  return getResolvedEachLocalName(
    expression,
    identifier.start - expression.sourceOffset,
    identifier.name,
  );
}

function getEachLocalRenameOffsets(
  target: EachLocalName,
  expressions: TemplateExpression[],
): number[] {
  const offsets = [target.sourceOffset];
  for (const expression of expressions) {
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
        const resolved = getResolvedEachLocalName(
          expression,
          start,
          identifier,
        );
        if (resolved?.sourceOffset === target.sourceOffset) {
          offsets.push(expression.sourceOffset + start);
        }
        continue;
      }
      offset = scanTemplateNonIdentifier(text, offset);
    }
  }
  return [...new Set(offsets)];
}

function getScriptRenameOffsets(
  snapshot: ts.IScriptSnapshot,
  scripts: ScriptBlock[],
  name: string,
): number[] {
  const offsets: number[] = [];
  const aliases = getScriptThisAliases(snapshot, scripts);
  for (const script of scripts) {
    const text = snapshot.getText(script.start, script.end);
    for (const property of [
      ...scanInstanceProperties(text, script.start, aliases),
      ...scanRiotV3MethodProperties(text, script.start),
    ]) {
      if (property.name === name && !offsets.includes(property.sourceOffset)) {
        offsets.push(property.sourceOffset);
      }
    }
  }
  return offsets;
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
