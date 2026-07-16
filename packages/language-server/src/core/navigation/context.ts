import type * as ts from 'typescript';
import * as html from 'vscode-html-languageservice';
import { getRiotV3Components, getTemplateIgnoredRanges } from '../components';
import { isIdentifierPart, isIdentifierStart } from '../scanners';
import { createTemplateAnalysis } from '../template';
import type { IdentifierRange, NavigationContext } from './types';

const htmlLs = html.getLanguageService();

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
  const identifier = getIdentifierAtOffset(sourceText, position);
  if (!identifier) {
    return;
  }

  const snapshot = createScriptSnapshot(sourceText);
  const htmlDocument = htmlLs.parseHTMLDocument(
    html.TextDocument.create('', 'html', 0, sourceText),
  );
  const components = getRiotV3Components(sourceText, htmlDocument);
  const component = getComponentAtOffset(components, position);
  if (!component) {
    return;
  }

  return {
    identifier,
    snapshot,
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
  };
}

function getComponentAtOffset(
  components: NavigationContext['component'][],
  offset: number,
): NavigationContext['component'] | undefined {
  return components.find(
    (component) => offset >= component.start && offset <= component.end,
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
