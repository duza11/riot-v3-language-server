import type { VirtualCode } from '@volar/language-core';
import {
  isIdentifierPart,
  isIdentifierStart,
  scanTemplateNonIdentifier,
} from '../scanners';
import type { GeneratedSegment } from '../types';
import {
  createEachCollectionExpression,
  getContainingEachScopes,
  getUsedBareEachLocalDefinitions,
} from './each';
import {
  shouldMaskTemplateIdentifier,
  shouldPrefixTemplateIdentifier,
} from './identifiers';
import type { EachScope, TemplateExpression } from './types';

const riotV3ScriptContextSuffix = `
}
`;

interface TemplateTypeNames {
  componentState: string;
  templateContext: string;
  templateInstance: string;
}

export function createTemplateVirtualCode(
  id: string,
  expressions: TemplateExpression[],
  eachScopes: EachScope[],
  typeNames: TemplateTypeNames,
): VirtualCode {
  const segments: GeneratedSegment[] = [
    { text: getTemplateContextPrefix(typeNames.templateContext) },
  ];
  segments.push(...generateEachLocalBindingSegments(eachScopes, typeNames));
  for (const expression of expressions) {
    const containingScopes = getContainingEachScopes(
      expression.sourceOffset,
      eachScopes,
      expression.excludedEachScopeSourceOffset,
    );
    segments.push({ text: '{\n' });
    segments.push(
      ...generateScopedExpressionSegments(
        expression,
        containingScopes,
        typeNames,
      ),
    );
    segments.push({ text: '}\n' });
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

function generateScopedExpressionSegments(
  expression: TemplateExpression,
  scopes: EachScope[],
  typeNames: TemplateTypeNames,
): GeneratedSegment[] {
  const usedLocalOffsets = getRequiredBareEachLocalOffsets(expression, scopes);
  return generateEachContextSegments(
    scopes,
    typeNames,
    usedLocalOffsets,
    new Set(),
    [
      { text: 'void (' },
      ...generateTemplateExpressionSegments(expression),
      { text: ');\n' },
    ],
  );
}

function generateEachLocalBindingSegments(
  eachScopes: EachScope[],
  typeNames: TemplateTypeNames,
): GeneratedSegment[] {
  const segments: GeneratedSegment[] = [];
  for (const targetScope of eachScopes) {
    if (!targetScope.localNames.length) {
      continue;
    }
    const scopes = getContainingEachScopes(
      targetScope.sourceOffset,
      eachScopes,
    );
    const targetLocalOffsets = new Set(
      targetScope.localNames.map((localName) => localName.sourceOffset),
    );
    const localOffsets = getRequiredEachCollectionLocalOffsets(scopes);
    for (const sourceOffset of targetLocalOffsets) {
      localOffsets.add(sourceOffset);
    }
    segments.push({ text: '{\n' });
    segments.push(
      ...generateEachContextSegments(
        scopes,
        typeNames,
        localOffsets,
        targetLocalOffsets,
        targetScope.localNames.map((localName) => ({
          text: `void ${localName.name};\n`,
        })),
      ),
    );
    segments.push({ text: '}\n' });
  }
  return segments;
}

function getRequiredBareEachLocalOffsets(
  expression: TemplateExpression,
  scopes: EachScope[],
): Set<number> {
  const offsets = new Set(
    getUsedBareEachLocalDefinitions(expression).map(
      (localName) => localName.sourceOffset,
    ),
  );
  for (const sourceOffset of getRequiredEachCollectionLocalOffsets(scopes)) {
    offsets.add(sourceOffset);
  }
  return offsets;
}

function getRequiredEachCollectionLocalOffsets(
  scopes: EachScope[],
): Set<number> {
  const offsets = new Set<number>();
  for (const scope of scopes) {
    for (const localName of getUsedBareEachLocalDefinitions(
      createEachCollectionExpression(scope),
    )) {
      offsets.add(localName.sourceOffset);
    }
  }
  return offsets;
}

function generateEachContextSegments(
  scopes: EachScope[],
  typeNames: TemplateTypeNames,
  localOffsets: Set<number>,
  mappedLocalOffsets: Set<number>,
  bodySegments: GeneratedSegment[],
): GeneratedSegment[] {
  const segments: GeneratedSegment[] = [];
  let parentDataType = typeNames.componentState;
  let parentContextType = typeNames.templateInstance;
  for (let index = 0; index < scopes.length; index++) {
    const scope = scopes[index];
    const collectionName = `__riot_v3_each_collection_${index}`;
    const dataName = `__riot_v3_each_data_${index}`;
    const contextName = `__riot_v3_each_context_${index}`;
    segments.push({ text: `const ${collectionName} = ` });
    segments.push(
      ...generateTemplateExpressionSegments(
        createEachCollectionExpression(scope),
        false,
      ),
    );
    segments.push({ text: ';\n' });
    const currentDataType = getEachCurrentDataType(scope, collectionName);
    segments.push({
      text: `type ${dataName} = RiotV3EachData<${currentDataType}, ${parentDataType}>;\n`,
    });
    segments.push({
      text: `type ${contextName} = RiotV3TypedEachContext<${dataName}, ${parentContextType}>;\n`,
    });
    segments.push({ text: `(function(this: ${contextName}) {\n` });
    for (const localName of scope.localNames) {
      if (!localOffsets.has(localName.sourceOffset)) {
        continue;
      }
      segments.push({ text: 'const ' });
      segments.push({
        text: localName.name,
        ...(mappedLocalOffsets.has(localName.sourceOffset)
          ? {
              sourceOffset: localName.sourceOffset,
              length: localName.name.length,
            }
          : {}),
      });
      segments.push({ text: ` = this.${localName.name};\n` });
    }
    parentDataType = dataName;
    parentContextType = contextName;
  }
  segments.push(...bodySegments);
  for (let index = scopes.length - 1; index >= 0; index--) {
    segments.push({ text: '});\n' });
  }
  return segments;
}

function getEachCurrentDataType(
  scope: EachScope,
  collectionName: string,
): string {
  if (scope.kind === 'shorthand') {
    return `RiotV3EachItem<typeof ${collectionName}>`;
  }
  const properties = scope.localNames.map((localName) => {
    const helper =
      localName.kind === 'item' ? 'RiotV3EachItem' : 'RiotV3EachIndex';
    return `${localName.name}: ${helper}<typeof ${collectionName}>;`;
  });
  return `{ ${properties.join(' ')} }`;
}

function generateTemplateExpressionSegments(
  expression: TemplateExpression,
  mapSource = true,
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
          ...(mapSource
            ? {
                sourceOffset: expression.sourceOffset + start,
                length: identifier.length,
              }
            : {}),
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
          ...(mapSource
            ? {
                sourceOffset: expression.sourceOffset + start,
                length: identifier.length,
              }
            : {}),
        });
      } else if (shouldPrefixTemplateIdentifier(text, start, identifier)) {
        segments.push({ text: 'this.' });
        segments.push({
          text: identifier,
          ...(mapSource
            ? {
                sourceOffset: expression.sourceOffset + start,
                length: identifier.length,
              }
            : {}),
        });
      } else {
        segments.push({
          text: identifier,
          ...(mapSource
            ? {
                sourceOffset: expression.sourceOffset + start,
                length: identifier.length,
              }
            : {}),
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
