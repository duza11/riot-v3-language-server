import type { VirtualCode } from '@volar/language-core';
import {
  isIdentifierPart,
  isIdentifierStart,
  scanTemplateNonIdentifier,
} from '../scanners';
import type { GeneratedSegment } from '../types';
import { getUsedEachLocalDefinitions } from './each';
import {
  shouldMaskTemplateIdentifier,
  shouldPrefixTemplateIdentifier,
} from './identifiers';
import type { EachLocalName, TemplateExpression } from './types';

const riotV3ScriptContextSuffix = `
}
`;

export function createTemplateVirtualCode(
  id: string,
  expressions: TemplateExpression[],
  typeNames: { templateContext: string; eachTemplateContext: string },
): VirtualCode {
  const segments: GeneratedSegment[] = [
    { text: getTemplateContextPrefix(typeNames.templateContext) },
  ];
  for (const expression of expressions) {
    const eachContext =
      expression.eachDepth === undefined
        ? undefined
        : getNestedEachContextTypeName(
            typeNames.eachTemplateContext,
            expression.eachDepth,
          );
    segments.push({
      text: eachContext ? `{\n(function(this: ${eachContext}) {\n` : '{\n',
    });
    segments.push(
      ...generateEachLocalDeclarationSegments(
        getUsedEachLocalDefinitions(expression),
      ),
    );
    segments.push({ text: 'void (' });
    segments.push(...generateTemplateExpressionSegments(expression));
    segments.push({ text: eachContext ? ');\n});\n}\n' : ');\n}\n' });
  }
  segments.push({ text: riotV3ScriptContextSuffix });

  let generatedText = '';
  const sourceOffsets: number[] = [];
  const generatedOffsets: number[] = [];
  const lengths: number[] = [];
  const generatedLengths: number[] = [];
  const completionSourceOffsets: number[] = [];
  const completionGeneratedOffsets: number[] = [];
  const completionLengths: number[] = [];
  const completionGeneratedLengths: number[] = [];

  for (const segment of segments) {
    const generatedOffset = generatedText.length;
    generatedText += segment.text;
    if (segment.sourceOffset !== undefined && segment.length !== undefined) {
      if (segment.data) {
        completionSourceOffsets.push(segment.sourceOffset);
        completionGeneratedOffsets.push(generatedOffset);
        completionLengths.push(segment.length);
        completionGeneratedLengths.push(
          segment.generatedLength ?? segment.length,
        );
      } else {
        sourceOffsets.push(segment.sourceOffset);
        generatedOffsets.push(generatedOffset);
        lengths.push(segment.length);
        generatedLengths.push(segment.generatedLength ?? segment.length);
      }
    }
  }

  return {
    id,
    languageId: 'typescript',
    snapshot: {
      getText: (start, end) => generatedText.substring(start, end),
      getLength: () => generatedText.length,
      getChangeRange: () => undefined,
    },
    mappings: [
      ...(completionSourceOffsets.length
        ? [
            {
              sourceOffsets: completionSourceOffsets,
              generatedOffsets: completionGeneratedOffsets,
              lengths: completionLengths,
              generatedLengths: completionGeneratedLengths,
              data: {
                completion: true,
                format: false,
                navigation: false,
                semantic: false,
                structure: false,
                verification: false,
              },
            },
          ]
        : []),
      ...(sourceOffsets.length
        ? [
            {
              sourceOffsets,
              generatedOffsets,
              lengths,
              generatedLengths,
              data: {
                completion: true,
                format: false,
                navigation: false,
                semantic: true,
                structure: true,
                verification: true,
              },
            },
          ]
        : []),
    ],
    embeddedCodes: [],
  };
}

function generateEachLocalDeclarationSegments(
  localNames: EachLocalName[],
): GeneratedSegment[] {
  const segments: GeneratedSegment[] = [];
  const collectionNames = new Map<string, string>();
  for (const localName of localNames) {
    const collectionKey =
      localName.collectionOffset + '\0' + localName.collectionText;
    let collectionName = collectionNames.get(collectionKey);
    if (!collectionName) {
      collectionName = `__riot_v3_each_collection_${collectionNames.size}`;
      collectionNames.set(collectionKey, collectionName);
      segments.push({ text: `const ${collectionName} = ` });
      segments.push(
        ...generateTemplateExpressionSegments({
          kind: 'expression',
          sourceOffset: localName.collectionOffset,
          text: localName.collectionText,
          localNames: localName.collectionLocalNames,
          localDefinitions: [],
          eachDepth: undefined,
        }),
      );
      segments.push({ text: ';\n' });
    }
    const helper =
      localName.kind === 'item' ? 'RiotV3EachItem' : 'RiotV3EachIndex';
    segments.push({ text: 'const ' });
    segments.push({
      text: localName.name,
      sourceOffset: localName.sourceOffset,
      length: localName.name.length,
    });
    segments.push({
      text: ` = undefined as unknown as ${helper}<typeof ${collectionName}>;\n`,
    });
  }
  return segments;
}

function generateTemplateExpressionSegments(
  expression: TemplateExpression,
): GeneratedSegment[] {
  const segments: GeneratedSegment[] = [];
  const text = expression.text;
  if (!text) {
    segments.push(createTemplateCompletionSegment(expression.sourceOffset));
    return segments;
  }

  for (let offset = 0; offset < text.length; ) {
    const char = text[offset];
    if (isIdentifierStart(char)) {
      const start = offset;
      offset++;
      while (offset < text.length && isIdentifierPart(text[offset])) {
        offset++;
      }
      const identifier = text.slice(start, offset);
      if (expression.localNames.includes(identifier)) {
        segments.push({
          text: identifier,
          sourceOffset: expression.sourceOffset + start,
          length: identifier.length,
        });
      } else if (
        shouldMaskTemplateIdentifier(
          text,
          start,
          identifier,
          expression.eachDepth !== undefined,
        )
      ) {
        segments.push({
          text: '({} as any)',
          sourceOffset: expression.sourceOffset + start,
          length: identifier.length,
        });
      } else if (shouldPrefixTemplateIdentifier(text, start, identifier)) {
        segments.push({ text: 'this.' });
        segments.push({
          text: identifier,
          sourceOffset: expression.sourceOffset + start,
          length: identifier.length,
        });
      } else {
        segments.push({
          text: identifier,
          sourceOffset: expression.sourceOffset + start,
          length: identifier.length,
        });
      }
      continue;
    }

    const skipped = scanTemplateNonIdentifier(text, offset);
    segments.push({ text: text.slice(offset, skipped) });
    offset = skipped;
  }

  return segments;
}

function getNestedEachContextTypeName(baseName: string, depth: number): string {
  return depth === 0 ? baseName : `${baseName}_${depth}`;
}

function createTemplateCompletionSegment(
  sourceOffset: number,
): GeneratedSegment {
  return {
    text: 'this.',
    sourceOffset,
    length: 0,
    generatedLength: 'this.'.length,
    data: {
      completion: true,
      format: false,
      navigation: false,
      semantic: false,
      structure: false,
      verification: false,
    },
  };
}

function getTemplateContextPrefix(instanceTypeName: string): string {
  return `function __riot_v3_template_context(this: ${instanceTypeName}) {
`;
}
