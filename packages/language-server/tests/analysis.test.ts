import { describe, expect, it } from 'vitest';
import { createVirtualCode } from './helpers/virtualCode';

describe('Riot v3 document analysis', () => {
  it('stores script and template analysis for each component', () => {
    // Arrange
    const source = `
<first-widget>
  <p>{ message }</p>
  <script>
    this.message = 'Hello'
  </script>
</first-widget>

<second-widget>
  <p each={ item in items }>{ item.name }</p>
  <script>
    this.items = [{ name: 'World' }]
  </script>
</second-widget>
`;

    // Act
    const code = createVirtualCode(source, '/workspace/components.tag');

    // Assert
    expect(
      code.analysis.components.map(({ script, template }) => ({
        properties: script.properties.map((property) => property.name),
        expressions: template.expressions.map((expression) => expression.text),
      })),
    ).toEqual([
      {
        properties: ['message'],
        expressions: ['message'],
      },
      {
        properties: ['items'],
        expressions: ['items', 'item.name'],
      },
    ]);
  });

  it('shares the parsed HTML document with the virtual code', () => {
    // Arrange
    const source = `
<demo-widget>
  <p>{ message }</p>
</demo-widget>
`;

    // Act
    const code = createVirtualCode(source);

    // Assert
    expect(code.htmlDocument).toBe(code.analysis.htmlDocument);
  });
});
