import {
  type CodeMapping,
  forEachEmbeddedCode,
  type LanguagePlugin,
  type VirtualCode,
} from '@volar/language-core';
import type { TypeScriptExtraServiceScript } from '@volar/typescript';
import type * as ts from 'typescript';
import * as html from 'vscode-html-languageservice';
import type { URI } from 'vscode-uri';
import {
  getRiotV3Components,
  getStyleLanguageId,
  getTemplateIgnoredRanges,
} from './core/components';
import {
  createRiotV3GlobalTypes,
  getComponentTypeNames,
} from './core/globalTypes';
import {
  findPreviousNonWhitespace,
  isIdentifierPart,
  isIdentifierStart,
  isInRanges,
  scanBalanced,
  scanComment,
  scanString,
  scanTemplateNonIdentifier,
} from './core/scanners';
import {
  generateScriptVirtualText,
  getComponentScriptLanguageId,
  getScriptProperties,
  getScriptThisAliases,
  scanInstanceProperties,
  scanRiotV3MethodProperties,
} from './core/script';
import type {
  GeneratedSegment,
  RiotV3Component,
  RiotV3ReferenceRange,
  RiotV3RenameRange,
  RiotV3RenameTextEdit,
  ScriptBlock,
  ScriptProperty,
  TextRange,
} from './core/types';

export type {
  RiotV3ReferenceRange,
  RiotV3RenameRange,
  RiotV3RenameTextEdit,
} from './core/types';

const scriptKind = {
  JS: 1,
  JSX: 2,
  TS: 3,
  TSX: 4,
  Deferred: 7,
} as const;

export const riotV3LanguagePlugin: LanguagePlugin<URI> = {
  getLanguageId(uri) {
    if (uri.path.endsWith('.tag')) {
      return 'riot_v3';
    }
  },
  createVirtualCode(_uri, languageId, snapshot) {
    if (languageId === 'riot_v3') {
      return new RiotV3VirtualCode(snapshot);
    }
  },
  typescript: {
    extraFileExtensions: [
      {
        extension: 'tag',
        isMixedContent: true,
        scriptKind: scriptKind.Deferred satisfies ts.ScriptKind.Deferred,
      },
    ],
    getServiceScript() {
      return undefined;
    },
    getExtraServiceScripts(fileName, root) {
      const scripts: TypeScriptExtraServiceScript[] = [];
      for (const code of forEachEmbeddedCode(root)) {
        if (code.id === 'riot_v3_globals') {
          scripts.push({
            fileName: fileName + '.' + code.id + '.d.ts',
            code,
            extension: '.d.ts',
            scriptKind: scriptKind.TS satisfies ts.ScriptKind.TS,
          });
        } else if (
          code.languageId === 'javascript' ||
          code.languageId === 'javascriptreact'
        ) {
          scripts.push({
            fileName:
              fileName +
              '.' +
              code.id +
              (code.languageId === 'javascriptreact' ? '.jsx' : '.js'),
            code,
            extension: code.languageId === 'javascriptreact' ? '.jsx' : '.js',
            scriptKind:
              code.languageId === 'javascriptreact'
                ? (scriptKind.JSX satisfies ts.ScriptKind.JSX)
                : (scriptKind.JS satisfies ts.ScriptKind.JS),
          });
        } else if (
          code.languageId === 'typescript' ||
          code.languageId === 'typescriptreact'
        ) {
          scripts.push({
            fileName:
              fileName +
              '.' +
              code.id +
              (code.languageId === 'typescriptreact' ? '.tsx' : '.ts'),
            code,
            extension: code.languageId === 'typescriptreact' ? '.tsx' : '.ts',
            scriptKind:
              code.languageId === 'typescriptreact'
                ? (scriptKind.TSX satisfies ts.ScriptKind.TSX)
                : (scriptKind.TS satisfies ts.ScriptKind.TS),
          });
        }
      }
      return scripts;
    },
  },
};

const htmlLs = html.getLanguageService();

export class RiotV3VirtualCode implements VirtualCode {
  id = 'root';
  languageId = 'html';
  mappings: CodeMapping[];
  embeddedCodes: VirtualCode[] = [];
  styleNodes: html.Node[] = [];
  scriptNodes: html.Node[] = [];

  htmlDocument: html.HTMLDocument;

  constructor(public snapshot: ts.IScriptSnapshot) {
    this.mappings = [
      {
        sourceOffsets: [0],
        generatedOffsets: [0],
        lengths: [snapshot.getLength()],
        data: {
          completion: true,
          format: true,
          navigation: true,
          semantic: true,
          structure: true,
          verification: true,
        },
      },
    ];
    this.htmlDocument = htmlLs.parseHTMLDocument(
      html.TextDocument.create(
        '',
        'html',
        0,
        snapshot.getText(0, snapshot.getLength()),
      ),
    );
    const components = getRiotV3Components(
      snapshot.getLength(),
      this.htmlDocument,
    );
    this.styleNodes = components.flatMap((component) => component.styles);
    this.scriptNodes = components.flatMap((component) => component.scriptNodes);
    this.embeddedCodes = [
      ...getRiotV3EmbeddedCodes(snapshot, components),
      createRiotV3GlobalTypes(
        components.map((component) => ({
          scriptProperties: getScriptProperties(snapshot, component.scripts),
          eachDepthCount: getEachDepthCount(snapshot, component.nodes),
        })),
      ),
    ];
  }
}

const riotV3ScriptContextSuffix = `
}
`;

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
  const identifier = getIdentifierAtOffset(sourceText, position);
  if (!identifier) {
    return [];
  }

  const snapshot = createScriptSnapshot(sourceText);
  const htmlDocument = htmlLs.parseHTMLDocument(
    html.TextDocument.create('', 'html', 0, sourceText),
  );
  const components = getRiotV3Components(sourceText.length, htmlDocument);
  const component = getComponentAtOffset(components, position);
  if (!component) {
    return [];
  }

  const expressions = getTemplateExpressions(
    snapshot,
    component.nodes,
    getTemplateIgnoredRanges(component),
    {
      start: component.start,
      end: component.end,
    },
  );
  const eachScopes = getEachScopes(sourceText, component.nodes);
  const eachLocal = getEachLocalRenameTarget(
    identifier,
    expressions,
    eachScopes,
  );
  if (eachLocal) {
    return getEachLocalRenameOffsets(eachLocal, expressions).map((offset) => ({
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
    )
  ) {
    return [];
  }

  return getRiotPropertyReferenceOffsets(
    snapshot,
    component,
    expressions,
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
  const identifier = getIdentifierAtOffset(sourceText, position);
  if (!identifier) {
    return [];
  }

  const snapshot = createScriptSnapshot(sourceText);
  const htmlDocument = htmlLs.parseHTMLDocument(
    html.TextDocument.create('', 'html', 0, sourceText),
  );
  const components = getRiotV3Components(sourceText.length, htmlDocument);
  const component = getComponentAtOffset(components, position);
  if (!component) {
    return [];
  }

  const expressions = getTemplateExpressions(
    snapshot,
    component.nodes,
    getTemplateIgnoredRanges(component),
    {
      start: component.start,
      end: component.end,
    },
  );
  const eachScopes = getEachScopes(sourceText, component.nodes);
  const eachLocal = getEachLocalRenameTarget(
    identifier,
    expressions,
    eachScopes,
  );
  if (eachLocal) {
    return getEachLocalRenameOffsets(eachLocal, expressions).map((offset) => ({
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
    )
  ) {
    return [];
  }
  return getRiotPropertyReferenceOffsets(
    snapshot,
    component,
    expressions,
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

  const expressions = getTemplateExpressions(
    snapshot,
    component.nodes,
    getTemplateIgnoredRanges(component),
    {
      start: component.start,
      end: component.end,
    },
  );
  const eachScopes = getEachScopes(sourceText, component.nodes);
  if (getEachLocalRenameTarget(identifier, expressions, eachScopes)) {
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
    )
  ) {
    return {
      start: identifier.start,
      end: identifier.end,
    };
  }
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
  const expressions = getTemplateExpressions(
    snapshot,
    component.nodes,
    getTemplateIgnoredRanges(component),
    {
      start: component.start,
      end: component.end,
    },
  );
  return expressions.some(
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

function getResolvedEachLocalName(
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

function* getRiotV3EmbeddedCodes(
  snapshot: ts.IScriptSnapshot,
  components: RiotV3Component[],
): Generator<VirtualCode> {
  let styleIndex = 0;
  let scriptIndex = 0;
  for (const component of components) {
    const componentTypeNames = getComponentTypeNames(component.index);
    const templateExpressions = getTemplateExpressions(
      snapshot,
      component.nodes,
      getTemplateIgnoredRanges(component),
      {
        start: component.start,
        end: component.end,
      },
    );

    for (const style of component.styles) {
      if (style.startTagEnd !== undefined && style.endTagStart !== undefined) {
        const styleText = snapshot.getText(
          style.startTagEnd,
          style.endTagStart,
        );
        yield {
          id: 'style_' + styleIndex++,
          languageId: getStyleLanguageId(style),
          snapshot: {
            getText: (start, end) => styleText.substring(start, end),
            getLength: () => styleText.length,
            getChangeRange: () => undefined,
          },
          mappings: [
            {
              sourceOffsets: [style.startTagEnd],
              generatedOffsets: [0],
              lengths: [styleText.length],
              data: {
                completion: true,
                format: true,
                navigation: true,
                semantic: true,
                structure: true,
                verification: true,
              },
            },
          ],
          embeddedCodes: [],
        };
      }
    }

    const scriptBlocks = component.scripts.map((script) => ({
      text: snapshot.getText(script.start, script.end),
      sourceOffset: script.start,
    }));
    if (scriptBlocks.some((script) => /\S/.test(script.text))) {
      const languageId = getComponentScriptLanguageId(component.scripts);
      const prefix = getScriptContextPrefix(
        languageId,
        componentTypeNames.tagInstance,
      );
      const generated = generateScriptVirtualText(scriptBlocks, prefix);
      yield {
        id: 'script_' + scriptIndex++,
        languageId,
        snapshot: {
          getText: (start, end) => generated.text.substring(start, end),
          getLength: () => generated.text.length,
          getChangeRange: () => undefined,
        },
        mappings: generated.mappings,
        embeddedCodes: [],
      };
    }

    if (templateExpressions.length) {
      yield createTemplateVirtualCode(
        components.length === 1 ? 'template' : 'template_' + component.index,
        templateExpressions,
        componentTypeNames,
      );
    }
  }
}

type TemplateExpressionKind = 'expression';

interface TemplateExpression {
  kind: TemplateExpressionKind;
  sourceOffset: number;
  text: string;
  localNames: string[];
  localDefinitions: EachLocalName[];
  eachDepth: number | undefined;
}

interface EachScope {
  start: number;
  end: number;
  sourceOffset: number;
  depth: number;
  localNames: EachLocalName[];
}

interface EachLocalName {
  name: string;
  sourceOffset: number;
  kind: 'item' | 'index';
  collectionOffset: number;
  collectionText: string;
  collectionLocalNames: string[];
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

function getTemplateExpressions(
  snapshot: ts.IScriptSnapshot,
  htmlNodes: html.Node[],
  ignoredRanges: TextRange[],
  range: { start: number; end: number },
): TemplateExpression[] {
  const sourceText = snapshot.getText(0, snapshot.getLength());
  const eachScopes = getEachScopes(sourceText, htmlNodes);
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

function getEachDepthCount(
  snapshot: ts.IScriptSnapshot,
  htmlNodes: html.Node[],
): number {
  const sourceText = snapshot.getText(0, snapshot.getLength());
  const scopes = getEachScopes(sourceText, htmlNodes);
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
  if (char === "'" || char === '"' || char === '`') {
    return scanString(text, offset);
  }
  if (char === '/' && (text[offset + 1] === '/' || text[offset + 1] === '*')) {
    return scanComment(text, offset);
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

function createTemplateVirtualCode(
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

function shouldPrefixTemplateIdentifier(
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

function getScriptContextPrefix(
  languageId:
    | 'javascript'
    | 'javascriptreact'
    | 'typescript'
    | 'typescriptreact',
  instanceTypeName: string,
): string {
  if (languageId === 'typescript' || languageId === 'typescriptreact') {
    return `function __riot_v3_script_context(this: ${instanceTypeName}) {
`;
  }
  return `/** @this {${instanceTypeName}} */
function __riot_v3_script_context() {
`;
}

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
