import type * as ts from 'typescript';
import {
  analyzeRiotV3Document,
  type RiotV3DocumentAnalysis,
} from '../analysis';
import { isIdentifierPart, isIdentifierStart } from '../scanners';
import type { IdentifierRange, NavigationContext } from './types';

function createScriptSnapshot(sourceText: string): ts.IScriptSnapshot {
  return {
    getText: (start, end) => sourceText.slice(start, end),
    getLength: () => sourceText.length,
    getChangeRange: () => undefined,
  };
}

export function getNavigationContext(
  sourceText: string,
  position: number,
): NavigationContext | undefined {
  return getNavigationContextForAnalysis(
    analyzeRiotV3Document(createScriptSnapshot(sourceText)),
    position,
  );
}

export function getNavigationContextForAnalysis(
  analysis: RiotV3DocumentAnalysis,
  position: number,
): NavigationContext | undefined {
  const identifier = getIdentifierAtOffset(analysis.sourceText, position);
  if (!identifier) {
    return;
  }
  const componentAnalysis = getComponentAtOffset(analysis.components, position);
  if (!componentAnalysis) {
    return;
  }
  return {
    identifier,
    analysis,
    componentAnalysis,
    snapshot: analysis.snapshot,
    component: componentAnalysis.component,
    templateAnalysis: componentAnalysis.template,
  };
}

function getComponentAtOffset(
  components: NavigationContext['componentAnalysis'][],
  offset: number,
): NavigationContext['componentAnalysis'] | undefined {
  return components.find(
    ({ component }) => offset >= component.start && offset <= component.end,
  );
}

function getIdentifierAtOffset(
  text: string,
  offset: number,
): IdentifierRange | undefined {
  let cursor = offset;
  if (
    !isIdentifierPart(text[cursor] ?? '') &&
    cursor > 0 &&
    isIdentifierPart(text[cursor - 1] ?? '')
  ) {
    cursor--;
  }
  if (!isIdentifierPart(text[cursor] ?? '')) {
    return;
  }
  let start = cursor;
  while (start > 0 && isIdentifierPart(text[start - 1])) {
    start--;
  }
  if (!isIdentifierStart(text[start])) {
    return;
  }
  let end = cursor + 1;
  while (end < text.length && isIdentifierPart(text[end])) {
    end++;
  }
  return {
    name: text.slice(start, end),
    start,
    end,
  };
}
