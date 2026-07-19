import type { CodeMapping } from '@volar/language-core';
import type * as html from 'vscode-html-languageservice';

export interface RiotV3RenameTextEdit {
  start: number;
  end: number;
  newText: string;
}

export interface RiotV3ReferenceRange {
  start: number;
  end: number;
}

export interface RiotV3RenameRange {
  start: number;
  end: number;
}

export interface GeneratedSegment {
  text: string;
  sourceOffset?: number;
  length?: number;
  generatedLength?: number;
  data?: CodeMapping['data'];
}

export interface TextRange {
  start: number;
  end: number;
}

export interface ScriptProperty {
  name: string;
  sourceOffset: number;
  typeName: string;
  assignmentKind: 'replacement' | 'augmentation';
  typeOrigin: 'inferred' | 'explicit';
  hasInferredAnyAssignment?: boolean;
  unionTypeNames?: string[];
}

export interface JSDocTypedef {
  name: string;
  typeName: string;
}

export type ScriptLanguageId =
  | 'javascript'
  | 'javascriptreact'
  | 'typescript'
  | 'typescriptreact';

export interface ScriptBlock {
  start: number;
  end: number;
  languageId: ScriptLanguageId;
}

export interface RiotV3Component {
  index: number;
  start: number;
  end: number;
  root: html.Node;
  nodes: html.Node[];
  styles: html.Node[];
  scriptNodes: html.Node[];
  htmlComments: TextRange[];
  scripts: ScriptBlock[];
}
