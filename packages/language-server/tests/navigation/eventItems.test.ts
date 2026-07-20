import { describe, expect, it } from 'vitest';
import {
  getRiotV3ReferenceOccurrences,
  getRiotV3ReferenceRanges,
  getRiotV3RenameEdits,
  getRiotV3RenameRange,
} from '../../src/languagePlugin';
import { offsetOf, startsOf } from '../helpers/virtualCode';

describe('Riot event item navigation', () => {
  it.each([
    ['Riot method', 'handleClick(e) { console.log(e.item.product) }'],
    [
      'this function property',
      'this.handleClick = function(e) { console.log(e.item.product) }',
    ],
    [
      'alias function property',
      'self.handleClick = function(e) { console.log(e.item.product) }',
    ],
    [
      'this arrow property',
      'this.handleClick = e => { console.log(e.item.product) }',
    ],
    [
      'alias arrow property',
      'self.handleClick = e => { console.log(e.item.product) }',
    ],
  ])('navigates event items in a %s', (_label, definition) => {
    // Arrange
    const source = `
      <demo-widget>
        <button each={ product in products } onclick={ handleClick } />
        <script>
          const self = this
          self.products = [{ name: 'Product' }]
          ${definition}
        </script>
      </demo-widget>
    `;
    const position = offsetOf(source, 'e.item.product', 'product');

    // Act
    const references = getRiotV3ReferenceRanges(source, position);

    // Assert
    expect(startsOf(references)).toEqual([
      offsetOf(source, 'product in products', 'product'),
      position,
    ]);
  });

  it('renames an explicit each item local from an event handler', () => {
    // Arrange
    const source = `
      <demo-widget>
        <button each={ product, i in products } onclick={ handleClick }>
          { product.name }
        </button>
        <script>
          const self = this
          self.products = [{ name: 'Product' }]
          handleClick(e) {
            console.log(e.item.product)
          }
        </script>
      </demo-widget>
    `;
    const position = offsetOf(source, 'e.item.product', 'product');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'entry');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, 'product, i in products', 'product'),
      offsetOf(source, '{ product.name }', 'product'),
      position,
    ]);
  });

  it('finds an explicit each index from an event handler', () => {
    // Arrange
    const source = `
      <demo-widget>
        <button each={ product, i in products } onclick={ handleClick } />
        <script>
          const self = this
          self.products = [{ name: 'Product' }]
          handleClick(e) {
            console.log(e.item.i)
          }
        </script>
      </demo-widget>
    `;
    const position = offsetOf(source, 'e.item.i') + 'e.item.'.length;

    // Act
    const references = getRiotV3ReferenceRanges(source, position);

    // Assert
    expect(startsOf(references)).toEqual([
      offsetOf(source, 'product, i in products', 'i in'),
      position,
    ]);
  });

  it('renames an explicit each item property from an event handler', () => {
    // Arrange
    const source = `
      <demo-widget>
        <button each={ product in products } onclick={ handleClick }>
          { product.name }
        </button>
        <script>
          /**
           * @typedef {object} Product
           * @property {string} name
           */
          const self = this
          /** @type {Product[]} */
          self.products = [{ name: 'Product' }]
          handleClick(e) {
            console.log(e.item.product.name)
          }
        </script>
      </demo-widget>
    `;
    const position = offsetOf(source, 'e.item.product.name', 'name');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'label');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, '@property {string} name', 'name'),
      offsetOf(source, "name: 'Product'", 'name'),
      offsetOf(source, '{ product.name }', 'name'),
      position,
    ]);
  });

  it('renames an event item local from its each declaration', () => {
    // Arrange
    const source = `
      <demo-widget>
        <button each={ product in products } onclick={ handleClick }>
          { product.name }
        </button>
        <script>
          const self = this
          self.products = [{ name: 'Product' }]
          handleClick(e) {
            console.log(e.item.product)
          }
        </script>
      </demo-widget>
    `;
    const position = offsetOf(source, 'product in products', 'product');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'entry');

    // Assert
    expect(startsOf(edits)).toEqual([
      position,
      offsetOf(source, '{ product.name }', 'product'),
      offsetOf(source, 'e.item.product', 'product'),
    ]);
  });

  it('renames an event item property from its collection declaration', () => {
    // Arrange
    const source = `
      <demo-widget>
        <button each={ product in products } onclick={ handleClick }>
          { product.name }
        </button>
        <script>
          const self = this
          self.products = [{ name: 'Product' }]
          handleClick(e) {
            console.log(e.item.product.name)
          }
        </script>
      </demo-widget>
    `;
    const position = offsetOf(source, "name: 'Product'", 'name');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'label');

    // Assert
    expect(startsOf(edits)).toEqual([
      position,
      offsetOf(source, '{ product.name }', 'name'),
      offsetOf(source, 'e.item.product.name', 'name'),
    ]);
  });

  it('renames a shorthand each item property from an event handler', () => {
    // Arrange
    const source = `
      <demo-widget>
        <button each={ products } onclick={ handleClick }>{ name }</button>
        <script>
          const self = this
          self.products = [{ name: 'Product' }]
          handleClick(e) {
            console.log(e.item.name)
          }
        </script>
      </demo-widget>
    `;
    const position = offsetOf(source, 'e.item.name', 'name');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'label');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, "name: 'Product'", 'name'),
      offsetOf(source, '{ name }', 'name'),
      position,
    ]);
  });

  it('does not navigate the Riot event item property itself', () => {
    // Arrange
    const source = `
      <demo-widget>
        <button each={ products } onclick={ handleClick } />
        <script>
          const self = this
          self.products = [{ name: 'Product' }]
          handleClick(e) {
            console.log(e.item.name)
          }
        </script>
      </demo-widget>
    `;
    const position = offsetOf(source, 'e.item.name', 'item');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'entry');

    // Assert
    expect(edits).toEqual([]);
  });

  it('returns every candidate from an ambiguous event item property', () => {
    // Arrange
    const source = getAmbiguousEventItemSource();
    const position = offsetOf(source, 'e.item.name', 'name');

    // Act
    const references = getRiotV3ReferenceRanges(source, position);

    // Assert
    expect(startsOf(references)).toEqual([
      offsetOf(source, "name: 'Product'", 'name'),
      offsetOf(source, "name: 'Category'", 'name'),
      offsetOf(source, '{ name }', 'name'),
      source.lastIndexOf('{ name }') + '{ '.length,
      position,
    ]);
  });

  it('returns every declaration for an ambiguous event item property', () => {
    // Arrange
    const source = getAmbiguousEventItemSource();
    const position = offsetOf(source, 'e.item.name', 'name');

    // Act
    const declarations = getRiotV3ReferenceOccurrences(source, position).filter(
      (occurrence) => occurrence.role === 'declaration',
    );

    // Assert
    expect(startsOf(declarations)).toEqual([
      offsetOf(source, "name: 'Product'", 'name'),
      offsetOf(source, "name: 'Category'", 'name'),
    ]);
  });

  it('rejects rename from an ambiguous event item property', () => {
    // Arrange
    const source = getAmbiguousEventItemSource();
    const position = offsetOf(source, 'e.item.name', 'name');

    // Act
    const range = getRiotV3RenameRange(source, position);
    const edits = getRiotV3RenameEdits(source, position, 'label');

    // Assert
    expect(range).toBeUndefined();
    expect(edits).toEqual([]);
  });

  it('excludes an ambiguous event occurrence from concrete rename edits', () => {
    // Arrange
    const source = getAmbiguousEventItemSource();
    const position = offsetOf(source, "name: 'Product'", 'name');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'label');

    // Assert
    expect(startsOf(edits)).toEqual([
      position,
      offsetOf(source, '{ name }', 'name'),
    ]);
  });

  it('allows rename when every binding resolves to the same symbol', () => {
    // Arrange
    const source = `
      <demo-widget>
        <button each={ product in products } onclick={ handleClick }>
          { product.name }
        </button>
        <button each={ product in products } onclick={ handleClick }>
          { product.name }
        </button>
        <script>
          const self = this
          self.products = [{ name: 'Product' }]
          handleClick(e) {
            console.log(e.item.product.name)
          }
        </script>
      </demo-widget>
    `;
    const position = offsetOf(source, 'e.item.product.name', 'name');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'label');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, "name: 'Product'", 'name'),
      offsetOf(source, '{ product.name }', 'name'),
      source.lastIndexOf('{ product.name }') + '{ product.'.length,
      position,
    ]);
  });

  it('rejects rename from an event local with different each declarations', () => {
    // Arrange
    const source = `
      <demo-widget>
        <button each={ product in products } onclick={ handleClick } />
        <button each={ product in archivedProducts } onclick={ handleClick } />
        <script>
          const self = this
          self.products = [{ name: 'Product' }]
          self.archivedProducts = [{ name: 'Archived' }]
          handleClick(e) {
            console.log(e.item.product)
          }
        </script>
      </demo-widget>
    `;
    const position = offsetOf(source, 'e.item.product', 'product');

    // Act
    const references = getRiotV3ReferenceRanges(source, position);
    const range = getRiotV3RenameRange(source, position);

    // Assert
    expect(startsOf(references)).toEqual([
      offsetOf(source, 'product in products', 'product'),
      offsetOf(source, 'product in archivedProducts', 'product'),
      position,
    ]);
    expect(range).toBeUndefined();
  });

  it('includes an ambiguous event local from either concrete declaration', () => {
    // Arrange
    const source = `
      <demo-widget>
        <button each={ product in products } onclick={ handleClick } />
        <button each={ product in archivedProducts } onclick={ handleClick } />
        <script>
          const self = this
          self.products = [{ name: 'Product' }]
          self.archivedProducts = [{ name: 'Archived' }]
          handleClick(e) {
            console.log(e.item.product)
          }
        </script>
      </demo-widget>
    `;
    const position = offsetOf(source, 'product in archivedProducts', 'product');

    // Act
    const references = getRiotV3ReferenceRanges(source, position);
    const edits = getRiotV3RenameEdits(source, position, 'entry');

    // Assert
    expect(startsOf(references)).toEqual([
      position,
      offsetOf(source, 'e.item.product', 'product'),
    ]);
    expect(startsOf(edits)).toEqual([position]);
  });

  it('navigates the innermost nested each event item property', () => {
    // Arrange
    const source = `
      <demo-widget>
        <div each={ category in categories }>
          <button each={ product in category.products } onclick={ handleClick } />
        </div>
        <script>
          const self = this
          self.categories = [{ products: [{ name: 'Product' }] }]
          handleClick(e) {
            console.log(e.item.product.name)
          }
        </script>
      </demo-widget>
    `;
    const position = offsetOf(source, 'e.item.product.name', 'name');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'label');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, "name: 'Product'", 'name'),
      position,
    ]);
  });
});

function getAmbiguousEventItemSource(): string {
  return `
    <demo-widget>
      <button each={ products } onclick={ handleClick }>
        { name }
      </button>
      <button each={ categories } onclick={ handleClick }>
        { name }
      </button>
      <script>
        const self = this
        self.products = [{ name: 'Product' }]
        self.categories = [{ name: 'Category' }]
        handleClick(e) {
          console.log(e.item.name)
        }
      </script>
    </demo-widget>
  `;
}
