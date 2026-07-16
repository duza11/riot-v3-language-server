import { describe, expect, it } from 'vitest';
import {
  getRiotV3ReferenceOccurrences,
  getRiotV3ReferenceRanges,
  getRiotV3RenameEdits,
} from '../../src/languagePlugin';
import {
  expectAllNewText,
  offsetOf,
  startsOf,
  textAtRanges,
} from '../helpers/virtualCode';

describe('root property navigation', () => {
  it('classifies root property declarations, reads, and writes', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p>{ message }</p>
    <script>
      const self = this
      self.message = 'Hello'
      console.log(self.message)
      self.message = 'Updated'
    </script>
  </demo-widget>
  `;
    const position = offsetOf(source, '{ message }', 'message');

    // Act
    const occurrences = getRiotV3ReferenceOccurrences(source, position);

    // Assert
    expect(occurrences.map(({ role }) => role)).toEqual([
      'declaration',
      'read',
      'write',
      'read',
    ]);
  });

  it('renames every script assignment from a template property reference', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p>{ message }</p>
    <button each={ text in texts } onclick={ handleClick }>{ text }</button>
    <script>
      const self = this
      self.texts = ['Hello', 'World']
      self.message = null
  
      handleClick(e) {
        self.message = e.item.text
      }
    </script>
  </demo-widget>
  `;
    const position = offsetOf(source, '{ message }', 'message');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'content');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, 'self.message = null', 'message'),
      offsetOf(source, 'self.message = e.item.text', 'message'),
      offsetOf(source, '{ message }', 'message'),
    ]);
    expectAllNewText(edits, 'content');
  });

  it('renames properties referenced from shorthand each scopes', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p each={ items }>{ name }</p>
    <script>
      this.items = [{ name: 'Alice' }]
    </script>
  </demo-widget>
  `;
    const position = offsetOf(source, "{ name: 'Alice' }", 'name');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'displayName');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, "{ name: 'Alice' }", 'name'),
      offsetOf(source, '{ name }', 'name'),
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

  it('finds every script assignment from a template property reference', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p>{ message }</p>
    <button each={ text in texts } onclick={ handleClick }>{ text }</button>
    <script>
      const self = this
      self.texts = ['Hello', 'World']
      self.message = null
  
      handleClick(e) {
        self.message = e.item.text
      }
    </script>
  </demo-widget>
  `;
    const position = offsetOf(source, '{ message }', 'message');

    // Act
    const references = getRiotV3ReferenceRanges(source, position);

    // Assert
    expect(startsOf(references)).toEqual([
      offsetOf(source, 'self.message = null', 'message'),
      offsetOf(source, 'self.message = e.item.text', 'message'),
      offsetOf(source, '{ message }', 'message'),
    ]);
  });

  it('finds every property reference from a script method assignment', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p>{ message }</p>
    <script>
      const self = this
      self.message = null
  
      handleClick(e) {
        self.message = e.item.text
      }
    </script>
  </demo-widget>
  `;
    const position = offsetOf(source, 'self.message = e.item.text', 'message');

    // Act
    const references = getRiotV3ReferenceRanges(source, position);

    // Assert
    expect(startsOf(references)).toEqual([
      offsetOf(source, 'self.message = null', 'message'),
      offsetOf(source, 'self.message = e.item.text', 'message'),
      offsetOf(source, '{ message }', 'message'),
    ]);
  });

  it('finds script property reads from a template property reference', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p>{ message }</p>
    <script>
      const self = this
      self.message = 'Hello'
  
      logMessage() {
        console.log(self.message)
      }
    </script>
  </demo-widget>
  `;
    const position = offsetOf(source, '{ message }', 'message');

    // Act
    const references = getRiotV3ReferenceRanges(source, position);

    // Assert
    expect(startsOf(references)).toEqual([
      offsetOf(source, "self.message = 'Hello'", 'message'),
      offsetOf(source, 'console.log(self.message)', 'message'),
      offsetOf(source, '{ message }', 'message'),
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
});
