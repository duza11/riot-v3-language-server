import type { CodeMapping, VirtualCode } from '@volar/language-core';
import type * as ts from 'typescript';
import type * as html from 'vscode-html-languageservice';
import {
  analyzeRiotV3Document,
  type RiotV3ComponentAnalysis,
  type RiotV3DocumentAnalysis,
} from './analysis';
import { getStyleLanguageId } from './components';
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
} from './script';
import { createTemplateVirtualCode } from './template';

export class RiotV3VirtualCode implements VirtualCode {
  id = 'root';
  languageId = 'html';
  mappings: CodeMapping[];
  embeddedCodes: VirtualCode[] = [];
  styleNodes: html.Node[] = [];
  scriptNodes: html.Node[] = [];

  htmlDocument: html.HTMLDocument;
  analysis: RiotV3DocumentAnalysis;

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
    this.analysis = analyzeRiotV3Document(snapshot, fileName);
    this.htmlDocument = this.analysis.htmlDocument;
    const fileTypeScope = fileName
      ? getRiotV3FileTypeScope(fileName)
      : undefined;
    const componentTypesModuleName =
      getRiotV3ComponentTypesModuleName(fileTypeScope);
    this.styleNodes = this.analysis.components.flatMap(
      ({ component }) => component.styles,
    );
    this.scriptNodes = this.analysis.components.flatMap(
      ({ component }) => component.scriptNodes,
    );
    this.embeddedCodes = [
      ...getRiotV3EmbeddedCodes(
        snapshot,
        this.analysis.components,
        componentTypesModuleName,
      ),
      createRiotV3GlobalTypesVirtualCode(
        this.analysis.components.map(({ script, template }) => ({
          scriptProperties: script.properties,
          jsDocTypedefs: script.jsDocTypedefs,
          eachDepthCount: template.eachDepthCount,
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
  componentAnalyses: RiotV3ComponentAnalysis[],
  componentTypesModuleName: string,
): Generator<VirtualCode> {
  let styleIndex = 0;
  let scriptIndex = 0;
  for (const { component, template } of componentAnalyses) {
    const componentTypeNames = getComponentTypeNames(component.index);
    const componentTypeReferences = {
      tagInstance: getRiotV3ComponentTypeReference(
        componentTypesModuleName,
        componentTypeNames.tagInstance,
      ),
      templateContext: getRiotV3ComponentTypeReference(
        componentTypesModuleName,
        componentTypeNames.templateContext,
      ),
      eachTemplateContext: getRiotV3ComponentTypeReference(
        componentTypesModuleName,
        componentTypeNames.eachTemplateContext,
      ),
    };

    for (const style of component.styles) {
      if (style.startTagEnd !== undefined && style.endTagStart !== undefined) {
        const styleText = maskSourceRanges(
          snapshot.getText(style.startTagEnd, style.endTagStart),
          style.startTagEnd,
          component.htmlComments,
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

    if (template.expressions.length) {
      yield createTemplateVirtualCode(
        componentAnalyses.length === 1
          ? 'template'
          : 'template_' + component.index,
        template.expressions,
        componentTypeReferences,
      );
    }
  }
}

function maskSourceRanges(
  text: string,
  sourceOffset: number,
  ranges: { start: number; end: number }[],
): string {
  let masked = text;
  for (const range of ranges) {
    const start = Math.max(0, range.start - sourceOffset);
    const end = Math.min(text.length, range.end - sourceOffset);
    if (start >= end) {
      continue;
    }
    masked =
      masked.slice(0, start) +
      masked.slice(start, end).replace(/[^\r\n]/g, ' ') +
      masked.slice(end);
  }
  return masked;
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
