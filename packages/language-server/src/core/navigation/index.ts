import { getScriptProperties } from '../script';
import type {
  RiotV3ReferenceRange,
  RiotV3RenameRange,
  RiotV3RenameTextEdit,
} from '../types';
import { getNavigationContext } from './context';
import {
  getEachLocalOccurrences,
  getEachLocalRenameTarget,
} from './eachLocals';
import { getNestedPropertyOccurrences } from './nestedProperties';
import {
  getRiotPropertyOccurrences,
  isRiotPropertyRenameSource,
} from './rootProperties';
import type { NavigationContext, NavigationOccurrence } from './types';

export function getRiotV3RenameEdits(
  sourceText: string,
  position: number,
  newName: string,
): RiotV3RenameTextEdit[] {
  const context = getNavigationContext(sourceText, position);
  if (!context) {
    return [];
  }
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
    return getEachLocalOccurrences(eachLocal, templateAnalysis.expressions);
  }

  const nestedOccurrences = getNestedPropertyReferenceOccurrences(context);
  if (nestedOccurrences) {
    return nestedOccurrences;
  }

  const scriptProperties = getScriptProperties(snapshot, component.scripts);
  if (
    !isRiotPropertyRenameSource(
      sourceText,
      identifier,
      scriptProperties,
      snapshot,
      component,
      templateAnalysis,
    )
  ) {
    return;
  }
  return getRiotPropertyOccurrences(
    snapshot,
    component,
    templateAnalysis.expressions,
    identifier.name,
  );
}

function getNestedPropertyReferenceOccurrences(
  context: NavigationContext,
): NavigationOccurrence[] | undefined {
  const occurrences = getNestedPropertyOccurrences(
    context.snapshot,
    context.component,
    context.templateAnalysis,
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
