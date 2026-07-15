import { describe, expect, it } from 'vitest';
import {
  getRiotV3ReferenceRanges,
  getRiotV3RenameEdits,
  getRiotV3RenameRange,
} from '../src/languagePlugin';
import {
  expectAllNewText,
  lastOffsetOf,
  offsetOf,
  startsOf,
  textAtRanges,
} from './helpers/virtualCode';

describe('rename edits', () => {
  it('renames a nested object property across script and template references', () => {
    // Arrange
    const source = `
<demo-widget>
  <p>{ user.name }</p>
  <script>
    const self = this
    self.user = { name: 'Alice' }
    console.log(self.user.name)
  </script>
</demo-widget>
`;
    const position = offsetOf(source, "{ name: 'Alice' }", 'name');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'displayName');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, "{ name: 'Alice' }", 'name'),
      offsetOf(source, 'self.user.name', 'name'),
      offsetOf(source, '{ user.name }', 'name'),
    ]);
    expectAllNewText(edits, 'displayName');
  });

  it('renames a nested object property from its template reference', () => {
    // Arrange
    const source = `
<demo-widget>
  <p>{ user.name }</p>
  <script>
    this.user = { name: 'Alice' }
  </script>
</demo-widget>
`;
    const position = offsetOf(source, '{ user.name }', 'name');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'displayName');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, "{ name: 'Alice' }", 'name'),
      offsetOf(source, '{ user.name }', 'name'),
    ]);
  });

  it('does not rename same-named properties on unrelated component state', () => {
    // Arrange
    const source = `
<demo-widget>
  <p>{ user.name }</p>
  <p>{ product.name }</p>
  <script>
    this.user = { name: 'Alice' }
    this.product = { name: 'Keyboard' }
  </script>
</demo-widget>
`;
    const position = offsetOf(source, "{ name: 'Alice' }", 'name');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'displayName');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, "{ name: 'Alice' }", 'name'),
      offsetOf(source, '{ user.name }', 'name'),
    ]);
  });

  it('renames a script method and its template reference from the script side', () => {
    const source = `
<demo-widget>
  <button onclick={ edit }>{ text }</button>
  <p>{ parent.edit }</p>
  <script>
    this.text = 'hello'
    edit(e) {
      this.text = e.target.value
    }
  </script>
</demo-widget>

<other-widget>
  <button onclick={ edit }></button>
  <script>
    edit() {}
  </script>
</other-widget>
`;
    const position = offsetOf(source, 'edit(e)', 'edit');

    const edits = getRiotV3RenameEdits(source, position, 'updateText');

    expect(textAtRanges(source, edits)).toEqual(['edit', 'edit']);
    expect(startsOf(edits)).toEqual([
      offsetOf(source, 'edit(e)', 'edit'),
      offsetOf(source, 'onclick={ edit }', 'edit'),
    ]);
    expectAllNewText(edits, 'updateText');
  });

  it('renames a script method and its template reference from the template side', () => {
    const source = `
<demo-widget>
  <button onclick={ edit }>{ text }</button>
  <script>
    this.text = 'hello'
    edit(e) {
      this.text = e.target.value
    }
  </script>
</demo-widget>
`;
    const position = offsetOf(source, 'onclick={ edit }', 'edit');

    const edits = getRiotV3RenameEdits(source, position, 'updateText');

    expect(startsOf(edits)).toEqual([
      offsetOf(source, 'edit(e)', 'edit'),
      offsetOf(source, 'onclick={ edit }', 'edit'),
    ]);
    expectAllNewText(edits, 'updateText');
  });

  it('renames script this-alias fields and template references from the script side', () => {
    const source = `
<demo-widget>
  <p>{ message }</p>
  <script>
    const self = this
    self.message = 'hello'
  </script>
</demo-widget>
`;
    const position = offsetOf(source, 'self.message', 'message');

    const edits = getRiotV3RenameEdits(source, position, 'title');

    expect(textAtRanges(source, edits)).toEqual(['message', 'message']);
    expect(startsOf(edits)).toEqual([
      offsetOf(source, 'self.message', 'message'),
      offsetOf(source, '{ message }', 'message'),
    ]);
    expectAllNewText(edits, 'title');
  });

  it('renames script this-alias fields and template references from the template side', () => {
    const source = `
<demo-widget>
  <p>{ message }</p>
  <script>
    const self = this
    self.message = 'hello'
  </script>
</demo-widget>
`;
    const position = offsetOf(source, '{ message }', 'message');

    const edits = getRiotV3RenameEdits(source, position, 'title');

    expect(textAtRanges(source, edits)).toEqual(['message', 'message']);
    expect(startsOf(edits)).toEqual([
      offsetOf(source, 'self.message', 'message'),
      offsetOf(source, '{ message }', 'message'),
    ]);
  });

  it('renames template references, script blocks, and open syntax aliases together', () => {
    const source = `
<demo-widget>
  <p>{ message }</p>
  <script>
    const self = this
    this.message = 'hello'
  </script>
  <script>
    const suffix = '!'
  </script>
  self.message = suffix
</demo-widget>
`;
    const position = offsetOf(source, '{ message }', 'message');

    const edits = getRiotV3RenameEdits(source, position, 'title');

    expect(startsOf(edits)).toEqual([
      offsetOf(source, 'this.message', 'message'),
      offsetOf(source, 'self.message', 'message'),
      offsetOf(source, '{ message }', 'message'),
    ]);
  });

  it('renames Riot v3 each local variables from their definition', () => {
    const source = `
<demo-widget>
  <ul>
    <li each={ item, i in items }>{ i }: { item.name }</li>
  </ul>
</demo-widget>
`;
    const position = offsetOf(source, 'item, i in items', 'item');

    const edits = getRiotV3RenameEdits(source, position, 'entry');

    expect(textAtRanges(source, edits)).toEqual(['item', 'item']);
    expect(startsOf(edits)).toEqual([
      offsetOf(source, 'item, i in items', 'item'),
      offsetOf(source, '{ item.name }', 'item'),
    ]);
    expectAllNewText(edits, 'entry');
  });

  it('renames Riot v3 each local variables from their reference', () => {
    const source = `
<demo-widget>
  <ul>
    <li each={ item, i in items }>{ i }: { item.name }</li>
  </ul>
</demo-widget>
`;
    const position = offsetOf(source, '{ item.name }', 'item');

    const edits = getRiotV3RenameEdits(source, position, 'entry');

    expect(textAtRanges(source, edits)).toEqual(['item', 'item']);
    expect(startsOf(edits)).toEqual([
      offsetOf(source, 'item, i in items', 'item'),
      offsetOf(source, '{ item.name }', 'item'),
    ]);
  });

  it('keeps outer shadowed Riot v3 each locals separate during rename', () => {
    const source = `
<demo-widget>
  <ul>
    <li each={ item in items }>
      <span>{ item.name }</span>
      <em each={ item in item.children }>{ item.name }</em>
      <strong>{ item.label }</strong>
    </li>
  </ul>
</demo-widget>
`;
    const position = offsetOf(source, 'item in items', 'item');

    const edits = getRiotV3RenameEdits(source, position, 'group');

    expect(startsOf(edits)).toEqual([
      offsetOf(source, 'item in items', 'item'),
      offsetOf(source, '{ item.name }', 'item'),
      offsetOf(source, 'item.children', 'item'),
      offsetOf(source, '{ item.label }', 'item'),
    ]);
    expect(textAtRanges(source, edits)).toEqual([
      'item',
      'item',
      'item',
      'item',
    ]);
  });

  it('keeps inner shadowed Riot v3 each locals separate during rename', () => {
    const source = `
<demo-widget>
  <ul>
    <li each={ item in items }>
      <span>{ item.name }</span>
      <em each={ item in item.children }>{ item.name }</em>
      <strong>{ item.label }</strong>
    </li>
  </ul>
</demo-widget>
`;
    const position = offsetOf(source, 'item in item.children', 'item');

    const edits = getRiotV3RenameEdits(source, position, 'child');

    expect(startsOf(edits)).toEqual([
      offsetOf(source, 'item in item.children', 'item'),
      lastOffsetOf(source, '{ item.name }', 'item'),
    ]);
    expect(textAtRanges(source, edits)).toEqual(['item', 'item']);
  });
});

describe('reference ranges', () => {
  it('finds nested object property references across script and templates', () => {
    // Arrange
    const source = `
<demo-widget>
  <p>{ user.name }</p>
  <script>
    const self = this
    self.user = { name: 'Alice' }
    console.log(self.user.name)
  </script>
</demo-widget>
`;
    const position = offsetOf(source, 'self.user.name', 'name');

    // Act
    const references = getRiotV3ReferenceRanges(source, position);

    // Assert
    expect(startsOf(references)).toEqual([
      offsetOf(source, "{ name: 'Alice' }", 'name'),
      offsetOf(source, 'self.user.name', 'name'),
      offsetOf(source, '{ user.name }', 'name'),
    ]);
  });

  it('finds references between script this-alias function assignments and template references from the script side', () => {
    const source = `
<demo-widget>
  <p>{ sum }</p>
  <script>
    self = this
    self.sum = function(a, b) {
      return a + b
    }
  </script>
</demo-widget>
`;
    const position = offsetOf(source, 'self.sum', 'sum');

    const references = getRiotV3ReferenceRanges(source, position);

    expect(startsOf(references)).toEqual([
      offsetOf(source, 'self.sum', 'sum'),
      offsetOf(source, '{ sum }', 'sum'),
    ]);
  });

  it('finds references between script this-alias function assignments and template references from the template side', () => {
    const source = `
<demo-widget>
  <p>{ sum }</p>
  <script>
    self = this
    self.sum = function(a, b) {
      return a + b
    }
  </script>
</demo-widget>
`;
    const position = offsetOf(source, '{ sum }', 'sum');

    const references = getRiotV3ReferenceRanges(source, position);

    expect(startsOf(references)).toEqual([
      offsetOf(source, 'self.sum', 'sum'),
      offsetOf(source, '{ sum }', 'sum'),
    ]);
  });

  it('finds references across template references, script blocks, and open syntax aliases', () => {
    const source = `
<demo-widget>
  <p>{ message }</p>
  <script>
    const self = this
    this.message = 'hello'
  </script>
  <script>
    const suffix = '!'
  </script>
  self.message = suffix
</demo-widget>
`;
    const position = offsetOf(source, '{ message }', 'message');

    const references = getRiotV3ReferenceRanges(source, position);

    expect(startsOf(references)).toEqual([
      offsetOf(source, 'this.message', 'message'),
      offsetOf(source, 'self.message', 'message'),
      offsetOf(source, '{ message }', 'message'),
    ]);
  });

  it('keeps outer shadowed Riot v3 each locals separate in references', () => {
    const source = `
<demo-widget>
  <ul>
    <li each={ item in items }>
      <span>{ item.name }</span>
      <em each={ item in item.children }>{ item.name }</em>
      <strong>{ item.label }</strong>
    </li>
  </ul>
</demo-widget>
`;
    const position = offsetOf(source, '{ item.name }', 'item');

    const references = getRiotV3ReferenceRanges(source, position);

    expect(startsOf(references)).toEqual([
      offsetOf(source, 'item in items', 'item'),
      offsetOf(source, '{ item.name }', 'item'),
      offsetOf(source, 'item.children', 'item'),
      offsetOf(source, '{ item.label }', 'item'),
    ]);
  });

  it('keeps inner shadowed Riot v3 each locals separate in references', () => {
    const source = `
<demo-widget>
  <ul>
    <li each={ item in items }>
      <span>{ item.name }</span>
      <em each={ item in item.children }>{ item.name }</em>
      <strong>{ item.label }</strong>
    </li>
  </ul>
</demo-widget>
`;
    const position = lastOffsetOf(source, '{ item.name }', 'item');

    const references = getRiotV3ReferenceRanges(source, position);

    expect(startsOf(references)).toEqual([
      offsetOf(source, 'item in item.children', 'item'),
      lastOffsetOf(source, '{ item.name }', 'item'),
    ]);
  });
});

describe('rename ranges', () => {
  it('returns the rename range for Riot v3 each local definitions', () => {
    const source = `
<demo-widget>
  <ul>
    <li each={ item, i in items }>{ i }: { item.name }</li>
  </ul>
</demo-widget>
`;
    const position = offsetOf(source, 'item, i in items', 'item');

    const range = getRiotV3RenameRange(source, position);

    expect(range).toEqual({
      start: position,
      end: position + 'item'.length,
    });
  });
});
