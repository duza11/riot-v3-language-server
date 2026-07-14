import { describe, expect, it } from 'vitest';
import { scanRegularExpression } from '../src/core/scanners';

describe('JavaScript scanners', () => {
  it('scans special characters inside regular expression literals', () => {
    // Arrange
    const source = '/[\'"`{}(),\\[\\]\\/]/giu';

    // Act
    const end = scanRegularExpression(source, 0);

    // Assert
    expect(end).toBe(source.length);
  });

  it('scans comment-like text inside regular expression literals', () => {
    // Arrange
    const source = String.raw`/\/\*|\/\//g`;

    // Act
    const end = scanRegularExpression(source, 0);

    // Assert
    expect(end).toBe(source.length);
  });

  it('does not scan division operators as regular expression literals', () => {
    // Arrange
    const source = 'total / count';
    const slash = source.indexOf('/');

    // Act
    const end = scanRegularExpression(source, slash);

    // Assert
    expect(end).toBeUndefined();
  });
});
