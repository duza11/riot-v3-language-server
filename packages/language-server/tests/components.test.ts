import { describe, expect, it } from 'vitest';
import { getRiotV3HtmlCommentRanges } from '../src/core/components';

describe('Riot v3 component comments', () => {
  it('treats an unclosed HTML comment as extending to the end of the source', () => {
    // Arrange
    const source = '<demo-widget><!-- editing';

    // Act
    const ranges = getRiotV3HtmlCommentRanges(source);

    // Assert
    expect(ranges).toEqual([
      { start: source.indexOf('<!--'), end: source.length },
    ]);
  });

  it('does not treat HTML comment markers in quoted strings as comments', () => {
    // Arrange
    const source = `const marker = '<!-- keep -->'\n<!-- remove -->`;

    // Act
    const ranges = getRiotV3HtmlCommentRanges(source);

    // Assert
    expect(ranges.map(({ start, end }) => source.slice(start, end))).toEqual([
      '<!-- remove -->',
    ]);
  });
});
