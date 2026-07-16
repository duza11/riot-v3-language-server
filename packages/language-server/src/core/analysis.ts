import type * as ts from 'typescript';
import * as html from 'vscode-html-languageservice';
import { getRiotV3Components, getTemplateIgnoredRanges } from './components';
import {
  getScriptJSDocTypedefs,
  getScriptProperties,
  getScriptThisAliases,
} from './script';
import { createTemplateAnalysis, type TemplateAnalysis } from './template';
import type { JSDocTypedef, RiotV3Component, ScriptProperty } from './types';

const htmlLs = html.getLanguageService();

export interface RiotV3ScriptAnalysis {
  properties: ScriptProperty[];
  aliases: string[];
  jsDocTypedefs: JSDocTypedef[];
}

export interface RiotV3ComponentAnalysis {
  component: RiotV3Component;
  script: RiotV3ScriptAnalysis;
  template: TemplateAnalysis;
}

export interface RiotV3DocumentAnalysis {
  snapshot: ts.IScriptSnapshot;
  sourceText: string;
  fileName?: string;
  htmlDocument: html.HTMLDocument;
  components: RiotV3ComponentAnalysis[];
}

export function analyzeRiotV3Document(
  snapshot: ts.IScriptSnapshot,
  fileName?: string,
): RiotV3DocumentAnalysis {
  const sourceText = snapshot.getText(0, snapshot.getLength());
  const htmlDocument = htmlLs.parseHTMLDocument(
    html.TextDocument.create('', 'html', 0, sourceText),
  );
  const components = getRiotV3Components(sourceText, htmlDocument).map(
    (component): RiotV3ComponentAnalysis => ({
      component,
      script: {
        properties: getScriptProperties(snapshot, component.scripts),
        aliases: getScriptThisAliases(snapshot, component.scripts),
        jsDocTypedefs: getScriptJSDocTypedefs(snapshot, component.scripts),
      },
      template: createTemplateAnalysis(
        snapshot,
        component.nodes,
        getTemplateIgnoredRanges(component),
        {
          start: component.start,
          end: component.end,
        },
      ),
    }),
  );
  return {
    snapshot,
    sourceText,
    fileName,
    htmlDocument,
    components,
  };
}
