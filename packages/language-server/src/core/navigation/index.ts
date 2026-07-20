import type { RiotV3DocumentAnalysis } from '../analysis';
import type {
  RiotV3ReferenceRange,
  RiotV3RenameRange,
  RiotV3RenameTextEdit,
} from '../types';
import {
  getNavigationContext,
  getNavigationContextForAnalysis,
} from './context';
import {
  getEachLocalOccurrences,
  getEachLocalRenameTarget,
} from './eachLocals';
import {
  getEventEachLocalOccurrences,
  getNestedPropertyOccurrences,
} from './nestedProperties';
import {
  getRiotPropertyOccurrences,
  isRiotPropertyRenameSource,
} from './rootProperties';
import type { NavigationContext, NavigationOccurrence } from './types';

export type { NavigationOccurrence } from './types';

export function getRiotV3RenameEdits(
  sourceText: string,
  position: number,
  newName: string,
): RiotV3RenameTextEdit[] {
  const context = getNavigationContext(sourceText, position);
  if (!context) {
    return [];
  }
  return getRenameEditsForContext(sourceText, context, newName);
}

export function getRiotV3RenameEditsForAnalysis(
  analysis: RiotV3DocumentAnalysis,
  position: number,
  newName: string,
): RiotV3RenameTextEdit[] {
  const context = getNavigationContextForAnalysis(analysis, position);
  if (!context) {
    return [];
  }
  return getRenameEditsForContext(analysis.sourceText, context, newName);
}

function getRenameEditsForContext(
  sourceText: string,
  context: NavigationContext,
  newName: string,
): RiotV3RenameTextEdit[] {
  return (getReferenceOccurrences(sourceText, context) ?? []).map(
    ({ start, end }) => ({
      start,
      end,
      newText: newName,
    }),
  );
}

export function getRiotV3ReferenceOccurrences(
  sourceText: string,
  position: number,
): NavigationOccurrence[] {
  const context = getNavigationContext(sourceText, position);
  if (!context) {
    return [];
  }
  return getReferenceOccurrences(sourceText, context) ?? [];
}

export function getRiotV3ReferenceOccurrencesForAnalysis(
  analysis: RiotV3DocumentAnalysis,
  position: number,
): NavigationOccurrence[] {
  const context = getNavigationContextForAnalysis(analysis, position);
  if (!context) {
    return [];
  }
  return getReferenceOccurrences(analysis.sourceText, context) ?? [];
}

export function getRiotV3ReferenceRanges(
  sourceText: string,
  position: number,
): RiotV3ReferenceRange[] {
  return getRiotV3ReferenceOccurrences(sourceText, position).map(
    ({ start, end }) => ({
      start,
      end,
    }),
  );
}

export function getRiotV3RenameRange(
  sourceText: string,
  position: number,
): RiotV3RenameRange | undefined {
  const context = getNavigationContext(sourceText, position);
  if (!context || !getReferenceOccurrences(sourceText, context)?.length) {
    return;
  }
  return getRenameRangeForContext(context);
}

export function getRiotV3RenameRangeForAnalysis(
  analysis: RiotV3DocumentAnalysis,
  position: number,
): RiotV3RenameRange | undefined {
  const context = getNavigationContextForAnalysis(analysis, position);
  if (
    !context ||
    !getReferenceOccurrences(analysis.sourceText, context)?.length
  ) {
    return;
  }
  return getRenameRangeForContext(context);
}

function getRenameRangeForContext(
  context: NavigationContext,
): RiotV3RenameRange {
  return {
    start: context.identifier.start,
    end: context.identifier.end,
  };
}

function getReferenceOccurrences(
  sourceText: string,
  context: NavigationContext,
): NavigationOccurrence[] | undefined {
  const { identifier, snapshot, component, templateAnalysis } = context;
  const eachLocal = getEachLocalRenameTarget(
    identifier,
    templateAnalysis.expressions,
    templateAnalysis.eachScopes,
  );
  if (eachLocal) {
    return mergeOccurrences(
      getEachLocalOccurrences(eachLocal, templateAnalysis.expressions),
      getEventEachLocalOccurrences(
        snapshot,
        context.componentAnalysis,
        eachLocal.sourceOffset,
      ),
    );
  }

  const nestedOccurrences = getNestedPropertyReferenceOccurrences(context);
  if (nestedOccurrences) {
    return nestedOccurrences;
  }

  const scriptProperties = context.componentAnalysis.script.properties;
  if (
    !isRiotPropertyRenameSource(
      sourceText,
      identifier,
      scriptProperties,
      component,
      templateAnalysis,
      context.componentAnalysis.script.aliases,
    )
  ) {
    return;
  }
  return getRiotPropertyOccurrences(
    snapshot,
    component,
    templateAnalysis.expressions,
    identifier.name,
    context.componentAnalysis.script,
  );
}

function mergeOccurrences(
  ...groups: NavigationOccurrence[][]
): NavigationOccurrence[] {
  const occurrences = new Map<string, NavigationOccurrence>();
  for (const occurrence of groups.flat()) {
    occurrences.set(`${occurrence.start}:${occurrence.end}`, occurrence);
  }
  return [...occurrences.values()].sort(
    (left, right) => left.start - right.start,
  );
}

function getNestedPropertyReferenceOccurrences(
  context: NavigationContext,
): NavigationOccurrence[] | undefined {
  const occurrences = getNestedPropertyOccurrences(
    context.snapshot,
    context.componentAnalysis,
  );
  const target = occurrences.find(
    (occurrence) =>
      context.identifier.start >= occurrence.start &&
      context.identifier.end <= occurrence.end,
  );
  if (!target) {
    return;
  }
  const matching = occurrences.filter(
    (occurrence) =>
      occurrence.symbolKey === target.symbolKey &&
      (target.symbolKey !== undefined ||
        (occurrence.path.length === target.path.length &&
          occurrence.path.every(
            (segment, index) => segment === target.path[index],
          ))),
  );
  if (!matching.some((occurrence) => occurrence.role === 'declaration')) {
    return;
  }
  return matching;
}
