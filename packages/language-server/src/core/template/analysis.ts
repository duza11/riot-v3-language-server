import type * as ts from 'typescript';
import type * as html from 'vscode-html-languageservice';
import { isInRanges } from '../scanners';
import type { TextRange } from '../types';
import { findTemplateExpressionEnd } from './attributes';
import { parseClassShorthandExpressions } from './classShorthand';
import {
  createEachCollectionExpression,
  getContainingEachScopes,
  getEachDepthForOffset,
  getEachScopes,
  getLocalDefinitionsForOffset,
  getLocalNamesForOffset,
} from './each';
import type { EachScope, TemplateAnalysis, TemplateExpression } from './types';

export function createTemplateAnalysis(
  snapshot: ts.IScriptSnapshot,
  htmlNodes: html.Node[],
  ignoredRanges: TextRange[],
  range: { start: number; end: number },
): TemplateAnalysis {
  const sourceText = snapshot.getText(0, snapshot.getLength());
  const eachScopes = getEachScopes(sourceText, htmlNodes);
  const expressions = getTemplateExpressionsForSource(
    sourceText,
    eachScopes,
    ignoredRanges,
    range,
  );
  return {
    expressions,
    eachScopes,
    eventBindings: getTemplateEventBindings(expressions, eachScopes),
  };
}

function getTemplateEventBindings(
  expressions: TemplateExpression[],
  eachScopes: EachScope[],
): TemplateAnalysis['eventBindings'] {
  return expressions.flatMap((expression) => {
    const eventName = expression.attributeName?.match(/^on(.+)$/)?.[1];
    if (!eventName) {
      return [];
    }
    const scopes = getContainingEachScopes(expression.sourceOffset, eachScopes);
    const handler = getDirectEventHandlerName(expression, scopes);
    if (!handler) {
      return [];
    }
    return [
      {
        handlerName: handler.name,
        eventName,
        sourceOffset:
          expression.sourceOffset + expression.text.lastIndexOf(handler.name),
        eachScopes: scopes,
      },
    ];
  });
}

function getDirectEventHandlerName(
  expression: TemplateExpression,
  eachScopes: EachScope[],
): { name: string } | undefined {
  const text = expression.text.trim();
  const direct = text.match(/^(?:this\.)?([A-Za-z_$][\w$]*)$/);
  if (direct) {
    if (hasEachLocal(eachScopes, direct[1])) {
      return;
    }
    return { name: direct[1] };
  }
  const parent = text.match(/^((?:parent\.)+)([A-Za-z_$][\w$]*)$/);
  if (!parent) {
    return;
  }
  const parentDepth = parent[1].match(/parent\./g)?.length ?? 0;
  if (parentDepth > eachScopes.length) {
    return;
  }
  const targetScopes = eachScopes.slice(0, eachScopes.length - parentDepth);
  if (hasEachLocal(targetScopes, parent[2])) {
    return;
  }
  return { name: parent[2] };
}

function hasEachLocal(eachScopes: EachScope[], name: string): boolean {
  return eachScopes.some((scope) =>
    scope.localNames.some((local) => local.name === name),
  );
}

function getTemplateExpressionsForSource(
  sourceText: string,
  eachScopes: EachScope[],
  ignoredRanges: TextRange[],
  range: { start: number; end: number },
): TemplateExpression[] {
  const expressions: TemplateExpression[] = [];

  for (let offset = range.start; offset < range.end; offset++) {
    if (sourceText[offset] !== '{' || isInRanges(offset, ignoredRanges)) {
      continue;
    }

    const end = findTemplateExpressionEnd(sourceText, offset);
    if (end === undefined) {
      continue;
    }

    const innerStart = offset + 1;
    const innerEnd = end;
    const leadingWhitespace =
      sourceText.slice(innerStart, innerEnd).match(/^\s*/)?.[0].length ?? 0;
    const trailingWhitespace =
      sourceText.slice(innerStart, innerEnd).match(/\s*$/)?.[0].length ?? 0;
    const textStart = innerStart + leadingWhitespace;
    const textEnd = innerEnd - trailingWhitespace;
    const expressionText = sourceText.slice(textStart, textEnd);
    const attributeName = getAttributeNameBeforeExpression(sourceText, offset);
    if (attributeName === 'each') {
      const eachScope = eachScopes.find(
        (scope) => scope.sourceOffset === textStart,
      );
      if (eachScope) {
        expressions.push(createEachCollectionExpression(eachScope));
      }
      offset = end;
      continue;
    }
    if (attributeName === 'class') {
      const classExpressions = parseClassShorthandExpressions(
        expressionText,
        textStart,
      );
      if (classExpressions.length) {
        for (const classExpression of classExpressions) {
          expressions.push({
            kind: 'expression',
            sourceOffset: classExpression.sourceOffset,
            text: classExpression.text,
            localNames: getLocalNamesForOffset(
              classExpression.sourceOffset,
              eachScopes,
            ),
            localDefinitions: getLocalDefinitionsForOffset(
              classExpression.sourceOffset,
              eachScopes,
            ),
            eachDepth: getEachDepthForOffset(
              classExpression.sourceOffset,
              eachScopes,
            ),
            attributeName,
          });
        }
        offset = end;
        continue;
      }
    }
    expressions.push({
      kind: 'expression',
      sourceOffset: textStart,
      text: expressionText,
      localNames: getLocalNamesForOffset(textStart, eachScopes),
      localDefinitions: getLocalDefinitionsForOffset(textStart, eachScopes),
      eachDepth: getEachDepthForOffset(textStart, eachScopes),
      attributeName,
    });
    offset = end;
  }

  return expressions;
}

function getAttributeNameBeforeExpression(
  text: string,
  offset: number,
): string | undefined {
  let cursor = offset - 1;
  while (cursor >= 0 && /\s/.test(text[cursor])) {
    cursor--;
  }
  if (text[cursor] !== '=') {
    return;
  }
  cursor--;
  while (cursor >= 0 && /\s/.test(text[cursor])) {
    cursor--;
  }
  const end = cursor + 1;
  while (cursor >= 0 && /[-\w:]/.test(text[cursor])) {
    cursor--;
  }
  if (cursor + 1 < end) {
    return text.slice(cursor + 1, end).toLowerCase();
  }
}
