import type * as ts from 'typescript';
import type {
  RiotV3ComponentAnalysis,
  RiotV3DocumentAnalysis,
} from '../analysis';
import type { TemplateAnalysis } from '../template';
import type { RiotV3Component } from '../types';

export type NavigationOccurrenceRole = 'declaration' | 'read' | 'write';

export interface NavigationOccurrence {
  start: number;
  end: number;
  role: NavigationOccurrenceRole;
}

export interface NestedPropertyOccurrence extends NavigationOccurrence {
  path: string[];
  symbolKey?: string;
}

export interface IdentifierRange {
  name: string;
  start: number;
  end: number;
}

export interface NavigationContext {
  identifier: IdentifierRange;
  analysis: RiotV3DocumentAnalysis;
  componentAnalysis: RiotV3ComponentAnalysis;
  snapshot: ts.IScriptSnapshot;
  component: RiotV3Component;
  templateAnalysis: TemplateAnalysis;
}
