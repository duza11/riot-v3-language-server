import { describe, expect, it } from 'vitest';
import type { NavigationOccurrence } from '../src/core/navigation/types';
import { filterReferenceOccurrences } from '../src/server/servicePlugin';

const occurrences: NavigationOccurrence[] = [
  { start: 10, end: 17, role: 'read' },
  { start: 20, end: 27, role: 'declaration' },
  { start: 30, end: 37, role: 'write' },
];

describe('reference occurrence filtering', () => {
  it('excludes declarations by role instead of array position', () => {
    // Arrange
    const includeDeclaration = false;

    // Act
    const filtered = filterReferenceOccurrences(
      occurrences,
      includeDeclaration,
    );

    // Assert
    expect(filtered.map(({ role }) => role)).toEqual(['read', 'write']);
  });

  it('keeps every occurrence when declarations are requested', () => {
    // Arrange
    const includeDeclaration = true;

    // Act
    const filtered = filterReferenceOccurrences(
      occurrences,
      includeDeclaration,
    );

    // Assert
    expect(filtered).toEqual(occurrences);
  });
});
