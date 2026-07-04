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
  generateScriptVirtualText,
  getComponentScriptLanguageId,
  getScriptProperties,
} from './core/script';
import {
  createTemplateVirtualCode,
  getEachDepthCount,
  getTemplateExpressions,
} from './core/template';
import type { RiotV3Component } from './core/types';

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

export {
  getRiotV3ReferenceRanges,
  getRiotV3RenameEdits,
  getRiotV3RenameRange,
} from './core/navigation';

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
