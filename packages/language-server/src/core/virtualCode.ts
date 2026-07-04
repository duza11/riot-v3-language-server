import type { CodeMapping, VirtualCode } from '@volar/language-core';
import type * as ts from 'typescript';
import * as html from 'vscode-html-languageservice';
import {
  getRiotV3Components,
  getStyleLanguageId,
  getTemplateIgnoredRanges,
} from './components';
import { createRiotV3GlobalTypes, getComponentTypeNames } from './globalTypes';
import {
  generateScriptVirtualText,
  getComponentScriptLanguageId,
  getScriptProperties,
} from './script';
import {
  createTemplateVirtualCode,
  getEachDepthCount,
  getTemplateExpressions,
} from './template';
import type { RiotV3Component } from './types';

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
