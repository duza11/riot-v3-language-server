import { describe, expect, it } from 'vitest';
import type { NavigationOccurrence } from '../src/core/navigation/types';
import {
  createUnusedComponentMemberDiagnostics,
  filterReferenceOccurrences,
} from '../src/server/servicePlugin';

const occurrences: NavigationOccurrence[] = [
  { start: 10, end: 17, role: 'read' },
  { start: 20, end: 27, role: 'declaration' },
  { start: 30, end: 37, role: 'write', isDefinition: true },
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

  it('keeps inferred definitions when declarations are excluded', () => {
    // Arrange
    const includeDeclaration = false;

    // Act
    const filtered = filterReferenceOccurrences(
      occurrences,
      includeDeclaration,
    );

    // Assert
    expect(filtered).toContainEqual({
      start: 30,
      end: 37,
      role: 'write',
      isDefinition: true,
    });
  });
});

describe('unused component member diagnostics', () => {
  it('creates a TypeScript-compatible hint at the member declaration', () => {
    // Arrange
    const members = [{ name: 'message', start: 10, end: 17 }];
    const positionAt = (offset: number) => ({ line: 0, character: offset });

    // Act
    const diagnostics = createUnusedComponentMemberDiagnostics(
      members,
      positionAt,
    );

    // Assert
    expect(diagnostics).toEqual([
      {
        severity: 4,
        range: {
          start: { line: 0, character: 10 },
          end: { line: 0, character: 17 },
        },
        code: 6133,
        source: 'riot_v3',
        tags: [1],
        message: "'message' is declared but its value is never read.",
      },
    ]);
  });
});
