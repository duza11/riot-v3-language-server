import type * as ts from 'typescript';
import type * as html from 'vscode-html-languageservice';
import { isInRanges } from '../scanners';
import type { TextRange } from '../types';
import { findTemplateExpressionEnd } from './attributes';
import { parseClassShorthandExpressions } from './classShorthand';
import {
  getEachDepthForOffset,
  getEachScopes,
  getLocalDefinitionsForOffset,
  getLocalNamesForOffset,
  parseEachExpression,
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
  return {
    expressions: getTemplateExpressionsForSource(
      sourceText,
      eachScopes,
      ignoredRanges,
      range,
    ),
    eachScopes,
  };
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
      const eachExpression = parseEachExpression(expressionText, textStart);
      if (eachExpression) {
        expressions.push({
          kind: 'expression',
          sourceOffset: eachExpression.collectionOffset,
          text: eachExpression.collectionText,
          localNames: getLocalNamesForOffset(
            eachExpression.collectionOffset,
            eachScopes,
            textStart,
          ),
          localDefinitions: getLocalDefinitionsForOffset(
            eachExpression.collectionOffset,
            eachScopes,
            textStart,
          ),
          eachDepth: getEachDepthForOffset(
            eachExpression.collectionOffset,
            eachScopes,
            textStart,
          ),
          excludedEachScopeSourceOffset: textStart,
        });
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
