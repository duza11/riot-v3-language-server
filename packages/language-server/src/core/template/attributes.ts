import type * as html from 'vscode-html-languageservice';
import { scanJavaScriptNonCode, scanString } from '../scanners';

export interface AttributeExpression {
  sourceOffset: number;
  text: string;
}

export function findAttributeExpression(
  sourceText: string,
  node: html.Node,
  attributeName: string,
): AttributeExpression | undefined {
  if (node.startTagEnd === undefined) {
    return;
  }

  const startTagText = sourceText.slice(node.start, node.startTagEnd);
  for (let offset = 0; offset < startTagText.length; ) {
    const char = startTagText[offset];
    if (char === "'" || char === '"') {
      offset = scanString(startTagText, offset);
      continue;
    }
    if (
      char !== attributeName[0] ||
      !matchesAttributeName(startTagText, offset, attributeName)
    ) {
      offset++;
      continue;
    }

    let cursor = offset + attributeName.length;
    while (cursor < startTagText.length && /\s/.test(startTagText[cursor])) {
      cursor++;
    }
    if (startTagText[cursor] !== '=') {
      offset = cursor;
      continue;
    }
    cursor++;
    while (cursor < startTagText.length && /\s/.test(startTagText[cursor])) {
      cursor++;
    }
    if (startTagText[cursor] !== '{') {
      offset = cursor;
      continue;
    }

    const sourceExpressionStart = node.start + cursor;
    const sourceExpressionEnd = findTemplateExpressionEnd(
      sourceText,
      sourceExpressionStart,
    );
    if (sourceExpressionEnd === undefined) {
      return;
    }

    const innerStart = sourceExpressionStart + 1;
    const leadingWhitespace =
      sourceText.slice(innerStart, sourceExpressionEnd).match(/^\s*/)?.[0]
        .length ?? 0;
    const trailingWhitespace =
      sourceText.slice(innerStart, sourceExpressionEnd).match(/\s*$/)?.[0]
        .length ?? 0;
    const textStart = innerStart + leadingWhitespace;
    const textEnd = sourceExpressionEnd - trailingWhitespace;
    return {
      sourceOffset: textStart,
      text: sourceText.slice(textStart, textEnd),
    };
  }
}

function matchesAttributeName(
  text: string,
  offset: number,
  attributeName: string,
): boolean {
  if (
    text.slice(offset, offset + attributeName.length).toLowerCase() !==
    attributeName
  ) {
    return false;
  }
  return (
    !/[-\w:]/.test(text[offset - 1] ?? '') &&
    !/[-\w:]/.test(text[offset + attributeName.length] ?? '')
  );
}

export function findTemplateExpressionEnd(
  text: string,
  start: number,
): number | undefined {
  let depth = 0;
  for (let offset = start; offset < text.length; ) {
    const char = text[offset];
    const skipped = scanJavaScriptNonCode(text, offset);
    if (skipped !== undefined) {
      offset = skipped;
      continue;
    }
    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return offset;
      }
    }
    offset++;
  }
}
