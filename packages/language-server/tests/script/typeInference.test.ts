import { describe, expect, it } from 'vitest';
import {
  getScriptIdentifierType,
  getTemplateIdentifierType,
} from '../helpers/typescript';
import { createVirtualCode } from '../helpers/virtualCode';

describe('script type inference', () => {
  it('resolves script object member types from JSDoc object typedefs', () => {
    const code = createVirtualCode(`
  <demo-widget>
    <script>
      const self = this
      /**
       * @typedef {Object} F
       * @property {string} path
       * @property {number} size
       */
      /** @type {F} */
      self.file = {
        path: 'path/to/memo.txt',
        size: 1024,
      }
      console.log(self.file.path)
    </script>
  </demo-widget>
  `);

    const type = getScriptIdentifierType(code, 'self.file.path', 'path');

    expect(type).toBe('string');
  });

  it('resolves script member types from JSDoc intersections', () => {
    const code = createVirtualCode(`
  <demo-widget>
    <script>
      /** @type {{ value: string } & { count: number }} */
      this.item = { value: 'value', count: 1 }
      console.log(this.item.count)
    </script>
  </demo-widget>
  `);

    const type = getScriptIdentifierType(code, 'this.item.count', 'count');

    expect(type).toBe('number');
  });

  it('resolves heterogeneous array element types from later script references', () => {
    // Arrange
    const code = createVirtualCode(`
  <demo-widget>
    <script>
      const self = this
      self.items = [{ a: 1 }, { a: 'a' }]
      console.log(this.items[0].a)
    </script>
  </demo-widget>
  `);

    // Act
    const type = getScriptIdentifierType(code, 'this.items[0].a', 'a');

    // Assert
    expect(type).toBe('string | number');
  });

  it('resolves unions from repeated assignments in later script references', () => {
    // Arrange
    const code = createVirtualCode(`
  <demo-widget>
    <script>
      const self = this
      self.message = null
      if (this.opts.flag === true) {
        self.message = 'Hello'
      }
      console.log(self.message)
    </script>
  </demo-widget>
  `);

    // Act
    const type = getScriptIdentifierType(code, 'self.message)', 'message');

    // Assert
    expect(type).toBe('string | null');
  });

  it('resolves unions from repeated nested property assignments', () => {
    // Arrange
    const code = createVirtualCode(`
  <demo-widget>
    <p>{ parentObj.childObj }</p>
    <script>
      const self = this
      self.parentObj = { childObj: null }
      self.parentObj.childObj = 'value'
    </script>
  </demo-widget>
  `);

    // Act
    const type = getTemplateIdentifierType(
      code,
      'this.parentObj.childObj',
      'childObj',
    );

    // Assert
    expect(type).toBe('string | null');
  });
});
