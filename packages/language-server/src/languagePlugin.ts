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
import {
  createTemplateVirtualCode,
  type EachLocalName,
  type EachScope,
  getEachDepthCount,
  getEachScopes,
  getResolvedEachLocalName,
  getTemplateExpressions,
  shouldPrefixTemplateIdentifier,
  type TemplateExpression,
} from './core/template';
import type {
  RiotV3Component,
  RiotV3ReferenceRange,
  RiotV3RenameRange,
  RiotV3RenameTextEdit,
  ScriptBlock,
  ScriptProperty,
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
