import type { CodeMapping } from '@volar/language-core';
import {
  isIdentifierStart,
  isInRanges,
  scanIdentifierEnd,
  scanJavaScriptNonCode,
} from '../scanners';
import type { GeneratedSegment, TextRange } from '../types';
import { scanFunctionLikeEnd, scanRiotV3MethodDefinition } from './syntax';

const riotV3ScriptContextSuffix = `
}
`;

const riotV3ImportStatement =
  /^\s*import(?!\w|(\s)?\()(?:(?:\s|[^\s'"])*)['|"].*\n?/gm;

export function generateScriptVirtualText(
  blocks: { text: string; sourceOffset: number }[],
  prefix: string,
): { text: string; mappings: CodeMapping[] } {
  const importSegments: GeneratedSegment[] = [];
  const bodySegments: GeneratedSegment[] = [{ text: prefix }];
  for (let index = 0; index < blocks.length; index++) {
    if (index > 0) {
      bodySegments.push({ text: '\n' });
    }
    const { imports, bodyRanges } = splitScriptImports(blocks[index].text);
    for (const imported of imports) {
      pushMappedScriptSegment(
        importSegments,
        blocks[index].text,
        imported.start,
        imported.end,
        blocks[index].sourceOffset,
      );
      if (
        !blocks[index].text.slice(imported.start, imported.end).endsWith('\n')
      ) {
        importSegments.push({ text: '\n' });
      }
    }
    for (const range of bodyRanges) {
      bodySegments.push(
        ...generateScriptSegments(
          blocks[index].text.slice(range.start, range.end),
          blocks[index].sourceOffset + range.start,
        ),
      );
    }
  }
  bodySegments.push({ text: riotV3ScriptContextSuffix });
  const segments = importSegments.length
    ? [...importSegments, { text: '\n' }, ...bodySegments]
    : bodySegments;
  let generatedText = '';
  const sourceOffsets: number[] = [];
  const generatedOffsets: number[] = [];
  const lengths: number[] = [];
  const generatedLengths: number[] = [];

  for (const segment of segments) {
    const generatedOffset = generatedText.length;
    generatedText += segment.text;
    if (segment.sourceOffset !== undefined && segment.length !== undefined) {
      sourceOffsets.push(segment.sourceOffset);
      generatedOffsets.push(generatedOffset);
      lengths.push(segment.length);
      generatedLengths.push(segment.generatedLength ?? segment.length);
    }
  }

  return {
    text: generatedText,
    mappings: sourceOffsets.length
      ? [
          {
            sourceOffsets,
            generatedOffsets,
            lengths,
            generatedLengths,
            data: {
              completion: true,
              format: true,
              navigation: true,
              semantic: true,
              structure: true,
              verification: true,
            },
          },
        ]
      : [],
  };
}

function splitScriptImports(text: string): {
  imports: TextRange[];
  bodyRanges: TextRange[];
} {
  const imports: TextRange[] = [];
  const nonCodeRanges = getJavaScriptNonCodeRanges(text);
  riotV3ImportStatement.lastIndex = 0;
  for (
    let match = riotV3ImportStatement.exec(text);
    match;
    match = riotV3ImportStatement.exec(text)
  ) {
    const importOffset = match.index + match[0].indexOf('import');
    if (isInRanges(importOffset, nonCodeRanges)) {
      continue;
    }
    imports.push({
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  if (!imports.length) {
    return {
      imports,
      bodyRanges: [{ start: 0, end: text.length }],
    };
  }

  const bodyRanges: TextRange[] = [];
  let cursor = 0;
  for (const imported of imports) {
    if (cursor < imported.start) {
      bodyRanges.push({ start: cursor, end: imported.start });
    }
    cursor = imported.end;
  }
  if (cursor < text.length) {
    bodyRanges.push({ start: cursor, end: text.length });
  }
  return { imports, bodyRanges };
}

function getJavaScriptNonCodeRanges(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  for (let offset = 0; offset < text.length; ) {
    const end = scanJavaScriptNonCode(text, offset);
    if (end !== undefined) {
      ranges.push({ start: offset, end });
      offset = end;
      continue;
    }
    offset++;
  }
  return ranges;
}

function generateScriptSegments(
  text: string,
  sourceOffset: number,
): GeneratedSegment[] {
  const segments: GeneratedSegment[] = [];
  let offset = 0;
  let lastMappedOffset = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;

  while (offset < text.length) {
    const char = text[offset];
    const skipped = scanJavaScriptNonCode(text, offset);
    if (skipped !== undefined) {
      offset = skipped;
      continue;
    }
    if (
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      isIdentifierStart(char)
    ) {
      const functionEnd = scanFunctionLikeEnd(text, offset);
      if (functionEnd !== undefined) {
        offset = functionEnd;
        continue;
      }
      const method = scanRiotV3MethodDefinition(text, offset);
      if (method) {
        pushMappedScriptSegment(
          segments,
          text,
          lastMappedOffset,
          method.nameStart,
          sourceOffset,
        );
        segments.push({ text: '\nthis.' });
        pushMappedScriptSegment(
          segments,
          text,
          method.nameStart,
          method.nameEnd,
          sourceOffset,
        );
        segments.push({ text: ' = function' });
        pushMappedScriptSegment(
          segments,
          text,
          method.nameEnd,
          method.bodyEnd,
          sourceOffset,
        );
        offset = method.bodyEnd;
        lastMappedOffset = method.bodyEnd;
        continue;
      }
      offset = scanIdentifierEnd(text, offset);
      continue;
    }

    if (char === '(') {
      parenDepth++;
    } else if (char === ')') {
      parenDepth--;
    } else if (char === '[') {
      bracketDepth++;
    } else if (char === ']') {
      bracketDepth--;
    } else if (char === '{') {
      braceDepth++;
    } else if (char === '}') {
      braceDepth--;
    }
    offset++;
  }

  pushMappedScriptSegment(
    segments,
    text,
    lastMappedOffset,
    text.length,
    sourceOffset,
  );
  return segments;
}

function pushMappedScriptSegment(
  segments: GeneratedSegment[],
  text: string,
  start: number,
  end: number,
  sourceOffset: number,
): void {
  if (start >= end) {
    return;
  }
  segments.push({
    text: text.slice(start, end),
    sourceOffset: sourceOffset + start,
    length: end - start,
  });
}
