import type { CodeMapping } from '@volar/language-core';

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
