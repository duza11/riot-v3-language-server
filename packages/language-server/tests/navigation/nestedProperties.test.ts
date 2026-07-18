import { describe, expect, it } from 'vitest';
import {
  getRiotV3ReferenceRanges,
  getRiotV3RenameEdits,
} from '../../src/languagePlugin';
import { expectAllNewText, offsetOf, startsOf } from '../helpers/virtualCode';

const typedNestedPropertySource = `
  <test-widget>
    <virtual each={ product in states.products }>
      <p>{ product.name }</p>
      <button onclick={ () => handleClick(product) }>Button</button>
    </virtual>
    <script>
      /**
       * @typedef {object} Product
       * @property {string} name
       * @property {number} price
       */
      const self = this
      self.states = {
        /** @type {Product[]} */
        products: [{ name: 'productA', price: 1000 }],
      }
      /** @param {Product} product */
      handleClick(product) {
        console.log(product.name)
      }
    </script>
  </test-widget>
`;

const typedNestedPropertyStarts = [
  offsetOf(typedNestedPropertySource, '@property {string} name', 'name'),
  offsetOf(typedNestedPropertySource, "name: 'productA'", 'name'),
  offsetOf(typedNestedPropertySource, 'console.log(product.name)', 'name'),
  offsetOf(typedNestedPropertySource, '{ product.name }', 'name'),
];

describe('nested property navigation', () => {
  it.each([
    ['the JSDoc declaration', '@property {string} name'],
    ['the object literal declaration', "name: 'productA'"],
    ['the script parameter reference', 'console.log(product.name)'],
    ['the each local reference', '{ product.name }'],
  ])('renames a typed nested property from %s', (_label, marker) => {
    // Arrange
    const position = offsetOf(typedNestedPropertySource, marker, 'name');

    // Act
    const edits = getRiotV3RenameEdits(
      typedNestedPropertySource,
      position,
      'label',
    );

    // Assert
    expect(startsOf(edits)).toEqual(typedNestedPropertyStarts);
  });

  it('finds every reference to a typed nested property', () => {
    // Arrange
    const position = offsetOf(
      typedNestedPropertySource,
      'console.log(product.name)',
      'name',
    );

    // Act
    const references = getRiotV3ReferenceRanges(
      typedNestedPropertySource,
      position,
    );

    // Assert
    expect(startsOf(references)).toEqual(typedNestedPropertyStarts);
  });

  it('does not combine same-named properties from different JSDoc types', () => {
    // Arrange
    const source = `
  <test-widget>
    <p each={ product in states.products }>{ product.name }</p>
    <p each={ category in states.categories }>{ category.name }</p>
    <script>
      /**
       * @typedef {object} Product
       * @property {string} name
       */
      /**
       * @typedef {object} Category
       * @property {string} name
       */
      const self = this
      self.states = {
        /** @type {Product[]} */
        products: [{ name: 'productA' }],
        /** @type {Category[]} */
        categories: [{ name: 'categoryA' }],
      }
    </script>
  </test-widget>
`;
    const position = offsetOf(source, '{ product.name }', 'name');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'label');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, '@property {string} name', 'name'),
      offsetOf(source, "name: 'productA'", 'name'),
      offsetOf(source, '{ product.name }', 'name'),
    ]);
  });

  it('renames parent collection properties from nested each expressions', () => {
    // Arrange
    const source = `
  <root>
    <section each={ groups }>
      <div each={ children }>
        <p each={ sibling in parent.siblings }>{ sibling.label }</p>
      </div>
    </section>
    <script>
      this.groups = [{
        children: [{}],
        siblings: [{ label: 'Sibling' }],
      }]
    </script>
  </root>
  `;
    const position = offsetOf(source, 'parent.siblings', 'siblings');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'related');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, "siblings: [{ label: 'Sibling' }]", 'siblings'),
      position,
    ]);
  });

  it('renames nested properties reached through parent collections', () => {
    // Arrange
    const source = `
  <root>
    <section each={ groups }>
      <div each={ children }>
        <p each={ sibling in this.parent.siblings }>{ sibling.label }</p>
      </div>
    </section>
    <script>
      this.groups = [{
        children: [{}],
        siblings: [{ label: 'Sibling' }],
      }]
    </script>
  </root>
  `;
    const position = offsetOf(source, '{ sibling.label }', 'label');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'title');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, "label: 'Sibling'", 'label'),
      position,
    ]);
  });

  it('renames nested properties reached through multiple parent contexts', () => {
    // Arrange
    const source = `
  <root>
    <section each={ groups }>
      <div each={ children }>
        <p each={ item in parent.parent.items }>{ item.name }</p>
      </div>
    </section>
    <script>
      this.groups = [{ children: [{}] }]
      this.items = [{ name: 'Root item' }]
    </script>
  </root>
  `;
    const position = offsetOf(source, '{ item.name }', 'name');

    // Act
    const references = getRiotV3ReferenceRanges(source, position);

    // Assert
    expect(startsOf(references)).toEqual([
      offsetOf(source, "name: 'Root item'", 'name'),
      position,
    ]);
  });

  it('renames methods declared in component state object literals', () => {
    // Arrange
    const source = `
  <demo-widget>
    <button onclick={ actions.save }>Save</button>
    <script>
      this.actions = {
        save() {},
      }
      this.actions.save()
    </script>
  </demo-widget>
  `;
    const position = offsetOf(source, 'save() {}', 'save');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'persist');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, 'save() {}', 'save'),
      offsetOf(source, 'this.actions.save()', 'save'),
      offsetOf(source, '{ actions.save }', 'save'),
    ]);
  });

  it('renames matching properties declared by every member of a JSDoc union', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p>{ entry.name }</p>
    <script>
      /**
       * @typedef {Object} TextEntry
       * @property {string} name
       */
      /**
       * @typedef {Object} NumericEntry
       * @property {number} name
       */
      /** @type {TextEntry | NumericEntry} */
      this.entry = this.opts.entry
    </script>
  </demo-widget>
  `;
    const position = offsetOf(source, '{ entry.name }', 'name');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'label');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, '@property {string} name', 'name'),
      offsetOf(source, '@property {number} name', 'name'),
      offsetOf(source, '{ entry.name }', 'name'),
    ]);
  });

  it('renames properties declared by a member of a JSDoc intersection', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p>{ entry.path }</p>
    <script>
      /**
       * @typedef {Object} StoredEntry
       * @property {string} path
       */
      /**
       * @typedef {Object} Timestamped
       * @property {number} updatedAt
       */
      /** @type {StoredEntry & Timestamped} */
      this.entry = this.opts.entry
    </script>
  </demo-widget>
  `;
    const position = offsetOf(source, '{ entry.path }', 'path');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'location');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, '@property {string} path', 'path'),
      offsetOf(source, '{ entry.path }', 'path'),
    ]);
  });

  it('renames properties declared by inline JSDoc object intersections', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p>{ entry.path }</p>
    <script>
      /** @type {{ path: string } & { updatedAt: number }} */
      this.entry = this.opts.entry
    </script>
  </demo-widget>
  `;
    const position = offsetOf(source, '{ entry.path }', 'path');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'location');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, '{ path: string }', 'path'),
      offsetOf(source, '{ entry.path }', 'path'),
    ]);
  });

  it('renames statically destructured object properties', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p>{ user.name }</p>
    <script>
      this.user = { name: 'Alice' }
      const { name: displayName } = this.user
      console.log(displayName)
    </script>
  </demo-widget>
  `;
    const position = offsetOf(source, '{ name: displayName }', 'name');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'label');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, "{ name: 'Alice' }", 'name'),
      offsetOf(source, '{ name: displayName }', 'name'),
      offsetOf(source, '{ user.name }', 'name'),
    ]);
  });

  it('does not rename nested properties without a static declaration', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p>{ data.name }</p>
    <script>
      /** @type {any} */
      this.data = this.opts.data
      console.log(this.data.name)
    </script>
  </demo-widget>
  `;
    const position = offsetOf(source, 'this.data.name', 'name');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'label');

    // Assert
    expect(edits).toEqual([]);
  });

  it('does not rename nested properties in another component', () => {
    // Arrange
    const source = `
  <first-widget>
    <p>{ user.name }</p>
    <script>this.user = { name: 'Alice' }</script>
  </first-widget>
  <second-widget>
    <p>{ user.name }</p>
    <script>this.user = { name: 'Bob' }</script>
  </second-widget>
  `;
    const position = offsetOf(source, "{ name: 'Alice' }", 'name');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'label');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, "{ name: 'Alice' }", 'name'),
      offsetOf(source, '{ user.name }', 'name'),
    ]);
  });

  it('renames array element properties across script and each references', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p each={ item in items }>{ item.name }</p>
    <script>
      const self = this
      self.items = [{ name: 'Alice' }]
      console.log(self.items[0].name)
    </script>
  </demo-widget>
  `;
    const position = offsetOf(source, 'self.items[0].name', 'name');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'displayName');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, "{ name: 'Alice' }", 'name'),
      offsetOf(source, 'self.items[0].name', 'name'),
      offsetOf(source, '{ item.name }', 'name'),
    ]);
  });

  it('renames array element properties through explicit each this contexts', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p each={ item in items }>{ item.name } { this.item.name }</p>
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
      offsetOf(source, '{ item.name }', 'name'),
      offsetOf(source, '{ this.item.name }', 'name'),
    ]);
  });

  it('renames array element properties through shorthand each this contexts', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p each={ items }>{ name } { this.name }</p>
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
      offsetOf(source, '{ this.name }', 'name'),
    ]);
  });

  it('finds the same shorthand each property references from this', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p each={ items }>{ name } { this.name }</p>
    <script>
      this.items = [{ name: 'Alice' }]
    </script>
  </demo-widget>
  `;
    const position = offsetOf(source, '{ this.name }', 'name');

    // Act
    const references = getRiotV3ReferenceRanges(source, position);

    // Assert
    expect(startsOf(references)).toEqual([
      offsetOf(source, "{ name: 'Alice' }", 'name'),
      offsetOf(source, '{ name }', 'name'),
      offsetOf(source, '{ this.name }', 'name'),
    ]);
  });

  it('renames shorthand properties nested in explicit each scopes', () => {
    // Arrange
    const source = `
  <demo-widget>
    <section each={ group in groups }>
      <p each={ group.children }>{ label } { this.label }</p>
    </section>
    <script>
      this.groups = [{ children: [{ label: 'Child' }] }]
    </script>
  </demo-widget>
  `;
    const position = offsetOf(source, "{ label: 'Child' }", 'label');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'title');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, "{ label: 'Child' }", 'label'),
      offsetOf(source, '{ label }', 'label'),
      offsetOf(source, '{ this.label }', 'label'),
    ]);
  });

  it('does not rename class shorthand keys with item properties', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p each={ items } class={ active: this.active }></p>
    <script>
      this.items = [{ active: true }]
    </script>
  </demo-widget>
  `;
    const position = offsetOf(source, '{ active: true }', 'active');
    const classExpression = 'active: this.active';
    const valueOffset =
      offsetOf(source, classExpression) + classExpression.lastIndexOf('active');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'enabled');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, '{ active: true }', 'active'),
      valueOffset,
    ]);
  });

  it('renames properties referenced from nested each scopes', () => {
    // Arrange
    const source = `
  <demo-widget>
    <section each={ group in groups }>
      <p each={ item in group.items }>{ item.name }</p>
    </section>
    <script>
      this.groups = [{ items: [{ name: 'Alice' }] }]
    </script>
  </demo-widget>
  `;
    const position = offsetOf(source, "{ name: 'Alice' }", 'name');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'displayName');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, "{ name: 'Alice' }", 'name'),
      offsetOf(source, '{ item.name }', 'name'),
    ]);
  });

  it('renames JSDoc array element properties from each references', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p each={ item in items }>{ item.name }</p>
    <script>
      /**
       * @typedef {Object} Item
       * @property {string} name
       */
      /** @type {Item[]} */
      this.items = this.opts.items
    </script>
  </demo-widget>
  `;
    const position = offsetOf(source, '{ item.name }', 'name');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'displayName');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, '@property {string} name', 'name'),
      offsetOf(source, '{ item.name }', 'name'),
    ]);
  });

  it('renames a JSDoc typedef property across script and template references', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p>{ file.path }</p>
    <script>
      const self = this
      /**
       * @typedef {Object} FileInfo
       * @property {string} path
       * @property {number} size
       */
      /** @type {FileInfo} */
      self.file = this.opts.file
      console.log(self.file.path)
    </script>
  </demo-widget>
  `;
    const position = offsetOf(source, 'self.file.path', 'path');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'location');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, '@property {string} path', 'path'),
      offsetOf(source, 'self.file.path', 'path'),
      offsetOf(source, '{ file.path }', 'path'),
    ]);
  });

  it('renames a shared JSDoc typedef property across component state objects', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p>{ primary.path }</p>
    <p>{ secondary.path }</p>
    <script>
      /**
       * @typedef {Object} FileInfo
       * @property {string} path
       */
      /** @type {FileInfo} */
      this.primary = this.opts.primary
      /** @type {FileInfo} */
      this.secondary = this.opts.secondary
    </script>
  </demo-widget>
  `;
    const position = offsetOf(source, '@property {string} path', 'path');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'location');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, '@property {string} path', 'path'),
      offsetOf(source, '{ primary.path }', 'path'),
      offsetOf(source, '{ secondary.path }', 'path'),
    ]);
  });

  it('renames recursively nested object properties', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p>{ settings.profile.name }</p>
    <script>
      const self = this
      self.settings = { profile: { name: 'Alice' } }
      console.log(self.settings.profile.name)
    </script>
  </demo-widget>
  `;
    const position = offsetOf(source, "{ name: 'Alice' }", 'name');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'displayName');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, "{ name: 'Alice' }", 'name'),
      offsetOf(source, 'self.settings.profile.name', 'name'),
      offsetOf(source, '{ settings.profile.name }', 'name'),
    ]);
  });

  it('renames statically indexed nested properties', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p>{ user['name'] }</p>
    <script>
      const self = this
      self.user = { name: 'Alice' }
      console.log(self.user['name'])
    </script>
  </demo-widget>
  `;
    const position = offsetOf(source, "self.user['name']", 'name');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'displayName');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, "{ name: 'Alice' }", 'name'),
      offsetOf(source, "self.user['name']", 'name'),
      offsetOf(source, "{ user['name'] }", 'name'),
    ]);
  });

  it('does not rename dynamically indexed nested properties', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p>{ user[key] }</p>
    <script>
      const self = this
      self.user = { name: 'Alice' }
      const key = 'name'
      console.log(self.user[key])
    </script>
  </demo-widget>
  `;
    const position = offsetOf(source, 'self.user[key]', 'key');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'displayName');

    // Assert
    expect(edits).toEqual([]);
  });

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
});
