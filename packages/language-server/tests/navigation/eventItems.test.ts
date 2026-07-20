import { describe, expect, it } from 'vitest';
import {
  getRiotV3ReferenceRanges,
  getRiotV3RenameEdits,
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
});
