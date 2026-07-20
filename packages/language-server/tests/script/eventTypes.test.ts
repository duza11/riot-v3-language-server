import { describe, expect, it } from 'vitest';
import { getScriptIdentifierType } from '../helpers/typescript';
import { createVirtualCode } from '../helpers/virtualCode';

describe('Riot event handler types', () => {
  it.each([
    ['Riot method', 'handleClick(e) { console.log(e.item.name) }'],
    [
      'this function property',
      'this.handleClick = function(e) { console.log(e.item.name) }',
    ],
    [
      'alias function property',
      'self.handleClick = function(e) { console.log(e.item.name) }',
    ],
    [
      'this arrow property',
      'this.handleClick = e => { console.log(e.item.name) }',
    ],
    [
      'alias arrow property',
      'self.handleClick = e => { console.log(e.item.name) }',
    ],
  ])('types the event parameter of a %s', (_label, definition) => {
    // Arrange
    const code = createVirtualCode(`
      <demo-widget>
        <button each={ products } onclick={ handleClick } />
        <script>
          const self = this
          self.products = [{ name: 'Product' }]
          ${definition}
        </script>
      </demo-widget>
    `);

    // Act
    const type = getScriptIdentifierType(code, 'item.name', 'name');

    // Assert
    expect(type).toBe('string');
  });

  it('types an explicit each item on a direct event handler', () => {
    // Arrange
    const code = createVirtualCode(`
      <demo-widget>
        <button each={ product, i in products } onclick={ handleClick }>
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
    `);

    // Act
    const type = getScriptIdentifierType(code, 'e.item.product.name', 'name');

    // Assert
    expect(type).toBe('string');
  });

  it('resolves a this-qualified direct event handler', () => {
    // Arrange
    const code = createVirtualCode(`
      <demo-widget>
        <button each={ products } onclick={ this.handleClick } />
        <script>
          const self = this
          self.products = [{ name: 'Product' }]
          handleClick(e) {
            console.log(e.item.name)
          }
        </script>
      </demo-widget>
    `);

    // Act
    const type = getScriptIdentifierType(code, 'item.name', 'name');

    // Assert
    expect(type).toBe('string');
  });

  it('resolves a parent-qualified root event handler', () => {
    // Arrange
    const code = createVirtualCode(`
      <demo-widget>
        <button each={ products } onclick={ parent.handleClick } />
        <script>
          const self = this
          self.products = [{ name: 'Product' }]
          handleClick(e) {
            console.log(e.item.name)
          }
        </script>
      </demo-widget>
    `);

    // Act
    const type = getScriptIdentifierType(code, 'item.name', 'name');

    // Assert
    expect(type).toBe('string');
  });

  it('resolves a parent-qualified root handler from a nested each context', () => {
    // Arrange
    const code = createVirtualCode(`
      <root>
        <div each={ list }>
          <div each={ message, i in parent.list }>
            <button onclick={ parent.handleClick } />
          </div>
        </div>
        <script>
          this.list = ['Hi!']
          handleClick(e) {
            console.log(e.item.i)
          }
        </script>
      </root>
    `);

    // Act
    const type = getScriptIdentifierType(code, 'i)', 'i');

    // Assert
    expect(type).toBe('number');
  });

  it('does not resolve a parent-qualified each local as a root handler', () => {
    // Arrange
    const code = createVirtualCode(`
      <root>
        <div each={ handleClick in handlers }>
          <div each={ message, i in parent.list }>
            <button onclick={ parent.handleClick } />
          </div>
        </div>
        <script>
          this.handlers = [() => undefined]
          this.list = ['Hi!']
          handleClick(e) {
            console.log(e.item.i)
          }
        </script>
      </root>
    `);

    // Act
    const type = getScriptIdentifierType(code, 'i)', 'i');

    // Assert
    expect(type).toBe('any');
  });

  it('types an explicit each index on a direct event handler', () => {
    // Arrange
    const code = createVirtualCode(`
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
    `);

    // Act
    const type = getScriptIdentifierType(code, 'i)', 'i');

    // Assert
    expect(type).toBe('number');
  });

  it('adds Riot event control properties to a direct event handler', () => {
    // Arrange
    const code = createVirtualCode(`
      <demo-widget>
        <button onclick={ handleClick } />
        <script>
          handleClick(e) {
            console.log(e.which)
            console.log(e.preventUpdate)
          }
        </script>
      </demo-widget>
    `);

    // Act
    const whichType = getScriptIdentifierType(code, 'e.which', 'which');
    const preventUpdateType = getScriptIdentifierType(
      code,
      'e.preventUpdate',
      'preventUpdate',
    );

    // Assert
    expect(whichType).toBe('number');
    expect(preventUpdateType).toBe('boolean | undefined');
  });

  it('uses undefined as the event item outside an each scope', () => {
    // Arrange
    const code = createVirtualCode(`
      <demo-widget>
        <button onclick={ handleClick } />
        <script>
          handleClick(e) {
            console.log(e.item)
          }
        </script>
      </demo-widget>
    `);

    // Act
    const type = getScriptIdentifierType(code, 'e.item', 'item');

    // Assert
    expect(type).toBe('undefined');
  });

  it('unions item types from multiple direct bindings', () => {
    // Arrange
    const code = createVirtualCode(`
      <demo-widget>
        <button each={ products } onclick={ handleClick } />
        <button each={ counts } onclick={ handleClick } />
        <script>
          const self = this
          self.products = [{ name: 'Product' }]
          self.counts = [1]
          handleClick(e) {
            console.log(e.item)
          }
        </script>
      </demo-widget>
    `);

    // Act
    const type = getScriptIdentifierType(code, 'e.item', 'item');

    // Assert
    expect(type).toBe('number | { name: string; }');
  });

  it('includes undefined when a handler is bound inside and outside each', () => {
    // Arrange
    const code = createVirtualCode(`
      <demo-widget>
        <button each={ products } onclick={ handleClick } />
        <button onclick={ handleClick } />
        <script>
          const self = this
          self.products = [{ name: 'Product' }]
          handleClick(e) {
            console.log(e.item)
          }
        </script>
      </demo-widget>
    `);

    // Act
    const type = getScriptIdentifierType(code, 'e.item', 'item');

    // Assert
    expect(type).toBe('{ name: string; } | undefined');
  });

  it('uses the innermost nested each context as the event item', () => {
    // Arrange
    const code = createVirtualCode(`
      <demo-widget>
        <div each={ category in categories }>
          <button each={ product, i in category.products } onclick={ handleClick } />
        </div>
        <script>
          const self = this
          self.categories = [{ products: [{ name: 'Product' }] }]
          handleClick(e) {
            console.log(e.item.product.name)
            console.log(e.item.i)
          }
        </script>
      </demo-widget>
    `);

    // Act
    const productNameType = getScriptIdentifierType(
      code,
      'item.product.name',
      'name',
    );
    const indexType = getScriptIdentifierType(code, 'i)', 'i');

    // Assert
    expect(productNameType).toBe('string');
    expect(indexType).toBe('number');
  });

  it('falls back to any for an unresolved each collection', () => {
    // Arrange
    const code = createVirtualCode(`
      <demo-widget>
        <button each={ getProducts() } onclick={ handleClick } />
        <script>
          getProducts() { return [] }
          handleClick(e) {
            console.log(e.item)
          }
        </script>
      </demo-widget>
    `);

    // Act
    const type = getScriptIdentifierType(code, 'e.item', 'item');

    // Assert
    expect(type).toBe('any');
  });

  it('preserves an explicit first parameter type', () => {
    // Arrange
    const code = createVirtualCode(`
      <demo-widget>
        <button each={ products } onclick={ handleClick } />
        <script>
          const self = this
          self.products = [{ name: 'Product' }]
          /** @param {{ custom: string }} e */
          handleClick(e) {
            console.log(e.custom)
          }
        </script>
      </demo-widget>
    `);

    // Act
    const type = getScriptIdentifierType(code, 'e.custom', 'custom');

    // Assert
    expect(type).toBe('string');
  });

  it('preserves an explicit arrow-function parameter type', () => {
    // Arrange
    const code = createVirtualCode(`
      <demo-widget>
        <button each={ products } onclick={ handleClick } />
        <script>
          const self = this
          self.products = [{ name: 'Product' }]
          /** @param {{ custom: string }} e */
          self.handleClick = (e) => {
            console.log(e.custom)
          }
        </script>
      </demo-widget>
    `);

    // Act
    const type = getScriptIdentifierType(code, 'e.custom', 'custom');

    // Assert
    expect(type).toBe('string');
  });

  it('uses the native DOM event type for a known event attribute', () => {
    // Arrange
    const code = createVirtualCode(`
      <demo-widget>
        <button onclick={ handleClick } />
        <script>
          handleClick(e) {
            console.log(e.clientX)
          }
        </script>
      </demo-widget>
    `);

    // Act
    const type = getScriptIdentifierType(code, 'e.clientX', 'clientX');

    // Assert
    expect(type).toBe('number');
  });

  it('falls back to Event for an unknown event attribute', () => {
    // Arrange
    const code = createVirtualCode(`
      <demo-widget>
        <button oncustom={ handleCustom } />
        <script>
          handleCustom(e) {
            console.log(e.type)
          }
        </script>
      </demo-widget>
    `);

    // Act
    const type = getScriptIdentifierType(code, 'e.type', 'type');

    // Assert
    expect(type).toBe('string');
  });

  it('infers a missing first parameter while preserving a JSDoc return type', () => {
    // Arrange
    const code = createVirtualCode(`
      <demo-widget>
        <button each={ products } onclick={ handleClick } />
        <script>
          const self = this
          self.products = [{ name: 'Product' }]
          /** @returns {boolean} */
          handleClick(e) {
            console.log(e.item.name)
            return true
          }
        </script>
      </demo-widget>
    `);

    // Act
    const type = getScriptIdentifierType(code, 'item.name', 'name');

    // Assert
    expect(type).toBe('string');
  });

  it('does not propagate an event item type back to component state', () => {
    // Arrange
    const code = createVirtualCode(`
      <demo-widget>
        <button each={ products } onclick={ handleClick } />
        <script>
          const self = this
          self.products = [{ name: 'Product' }]
          handleClick(e) {
            self.selected = e.item
            console.log(self.selected)
          }
        </script>
      </demo-widget>
    `);

    // Act
    const type = getScriptIdentifierType(code, 'self.selected)', 'selected');

    // Assert
    expect(type).toBe('any');
  });
});
