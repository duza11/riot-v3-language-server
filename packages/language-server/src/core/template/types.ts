export type TemplateExpressionKind = 'expression';

export interface TemplateExpression {
  kind: TemplateExpressionKind;
  sourceOffset: number;
  text: string;
  localNames: string[];
  localDefinitions: EachLocalName[];
  eachDepth: number | undefined;
  excludedEachScopeSourceOffset?: number;
}

export interface EachScope {
  kind: 'shorthand' | 'explicit';
  start: number;
  end: number;
  sourceOffset: number;
  collectionOffset: number;
  collectionText: string;
  collectionLocalNames: string[];
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
}
