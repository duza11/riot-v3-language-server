import {
  isIdentifierPart,
  isIdentifierStart,
  scanTemplateNonIdentifier,
} from '../scanners';
import {
  type EachLocalName,
  type EachScope,
  getResolvedEachLocalName,
  type TemplateExpression,
} from '../template';
import type { IdentifierRange, NavigationOccurrence } from './types';

export function getEachLocalRenameTarget(
  identifier: IdentifierRange,
  expressions: TemplateExpression[],
  scopes: EachScope[],
): EachLocalName | undefined {
  for (const scope of scopes) {
    for (const localName of scope.localNames) {
      if (
        identifier.name === localName.name &&
        identifier.start >= localName.sourceOffset &&
        identifier.end <= localName.sourceOffset + localName.name.length
      ) {
        return localName;
      }
    }
  }

  const expression = expressions.find(
    (expression) =>
      identifier.start >= expression.sourceOffset &&
      identifier.end <= expression.sourceOffset + expression.text.length,
  );
  if (!expression) {
    return;
  }
  return getResolvedEachLocalName(
    expression,
    identifier.start - expression.sourceOffset,
    identifier.name,
  );
}

export function getEachLocalOccurrences(
  target: EachLocalName,
  expressions: TemplateExpression[],
): NavigationOccurrence[] {
  const occurrences: NavigationOccurrence[] = [
    {
      start: target.sourceOffset,
      end: target.sourceOffset + target.name.length,
      role: 'declaration',
    },
  ];
  for (const expression of expressions) {
    const text = expression.text;
    for (let offset = 0; offset < text.length; ) {
      const char = text[offset];
      if (isIdentifierStart(char)) {
        const start = offset;
        offset++;
        while (offset < text.length && isIdentifierPart(text[offset])) {
          offset++;
        }
        const identifier = text.slice(start, offset);
        const resolved = getResolvedEachLocalName(
          expression,
          start,
          identifier,
        );
        if (resolved?.sourceOffset === target.sourceOffset) {
          const sourceStart = expression.sourceOffset + start;
          if (
            !occurrences.some((occurrence) => occurrence.start === sourceStart)
          ) {
            occurrences.push({
              start: sourceStart,
              end: sourceStart + identifier.length,
              role: 'read',
            });
          }
        }
        continue;
      }
      offset = scanTemplateNonIdentifier(text, offset);
    }
  }
  return occurrences;
}
