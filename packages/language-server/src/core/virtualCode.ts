import type { CodeMapping, VirtualCode } from '@volar/language-core';
import type * as ts from 'typescript';
import * as html from 'vscode-html-languageservice';
import {
  getRiotV3Components,
  getStyleLanguageId,
  getTemplateIgnoredRanges,
} from './components';
import {
  generateRiotV3GlobalTypes,
  getComponentTypeNames,
  getRiotV3ComponentTypeReference,
  getRiotV3ComponentTypesModuleName,
  getRiotV3FileTypeScope,
  type RiotV3GlobalTypesComponentData,
} from './globalTypes';
import {
  generateScriptVirtualText,
  getComponentScriptLanguageId,
  getScriptJSDocTypedefs,
  getScriptProperties,
} from './script';
import {
  createTemplateAnalysis,
  createTemplateVirtualCode,
  type TemplateAnalysis,
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

  constructor(
    public snapshot: ts.IScriptSnapshot,
    fileName?: string,
  ) {
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
    const fileTypeScope = fileName
      ? getRiotV3FileTypeScope(fileName)
      : undefined;
    const componentTypesModuleName =
      getRiotV3ComponentTypesModuleName(fileTypeScope);
    this.styleNodes = components.flatMap((component) => component.styles);
    this.scriptNodes = components.flatMap((component) => component.scriptNodes);
    const componentAnalyses = components.map((component) => ({
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
    }));
    this.embeddedCodes = [
      ...getRiotV3EmbeddedCodes(
        snapshot,
        componentAnalyses,
        componentTypesModuleName,
      ),
      createRiotV3GlobalTypesVirtualCode(
        componentAnalyses.map(({ component, templateAnalysis }) => ({
          scriptProperties: getScriptProperties(snapshot, component.scripts),
          jsDocTypedefs: getScriptJSDocTypedefs(snapshot, component.scripts),
          eachDepthCount: templateAnalysis.eachDepthCount,
        })),
        fileTypeScope,
      ),
    ];
  }
}

function createRiotV3GlobalTypesVirtualCode(
  components: RiotV3GlobalTypesComponentData[],
  fileTypeScope?: string,
): VirtualCode {
  const generated = generateRiotV3GlobalTypes(components, fileTypeScope);
  let generatedText = generated.text;
  const sourceOffsets: number[] = [];
  const generatedOffsets: number[] = [];
  const lengths: number[] = [];
  for (const segment of generated.segments) {
    const generatedOffset = generatedText.length;
    generatedText += segment.text;
    if (segment.sourceOffset !== undefined && segment.length !== undefined) {
      sourceOffsets.push(segment.sourceOffset);
      generatedOffsets.push(generatedOffset);
      lengths.push(segment.length);
    }
  }

  return {
    id: 'riot_v3_globals',
    languageId: 'typescript',
    snapshot: {
      getText: (start, end) => generatedText.substring(start, end),
      getLength: () => generatedText.length,
      getChangeRange: () => undefined,
    },
    mappings: sourceOffsets.length
      ? [
          {
            sourceOffsets,
            generatedOffsets,
            lengths,
            data: {
              completion: true,
              format: false,
              navigation: true,
              semantic: false,
              structure: true,
              verification: true,
            },
          },
        ]
      : [],
    embeddedCodes: [],
  };
}

function* getRiotV3EmbeddedCodes(
  snapshot: ts.IScriptSnapshot,
  componentAnalyses: {
    component: RiotV3Component;
    templateAnalysis: TemplateAnalysis;
  }[],
  componentTypesModuleName: string,
): Generator<VirtualCode> {
  let styleIndex = 0;
  let scriptIndex = 0;
  for (const { component, templateAnalysis } of componentAnalyses) {
    const componentTypeNames = getComponentTypeNames(component.index);
    const componentTypeReferences = {
      tagInstance: getRiotV3ComponentTypeReference(
        componentTypesModuleName,
        componentTypeNames.tagInstance,
      ),
      templateInstance: getRiotV3ComponentTypeReference(
        componentTypesModuleName,
        componentTypeNames.templateInstance,
      ),
      eachContext: getRiotV3ComponentTypeReference(
        componentTypesModuleName,
        componentTypeNames.eachContext,
      ),
    };

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
        componentTypeReferences.tagInstance,
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

    if (templateAnalysis.expressions.length) {
      yield createTemplateVirtualCode(
        componentAnalyses.length === 1
          ? 'template'
          : 'template_' + component.index,
        templateAnalysis.expressions,
        componentTypeReferences,
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
