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

  it('infers concrete properties added to open objects', () => {
    // Arrange
    const code = createVirtualCode(`
  <demo-widget>
    <script>
      const self = this
      self.obj = {}
      self.obj.hoge = 1
      console.log(self.obj.hoge)
    </script>
  </demo-widget>
  `);

    // Act
    const type = getScriptIdentifierType(code, 'self.obj.hoge)', 'hoge');

    // Assert
    expect(type).toBe('number');
  });

  it('adds concrete properties to every inferred object union member', () => {
    // Arrange
    const code = createVirtualCode(`
  <demo-widget>
    <p>{ obj.shared }</p>
    <script>
      const self = this
      self.obj = { left: 1 }
      self.obj = { right: 'value' }
      self.obj.shared = true
    </script>
  </demo-widget>
  `);

    // Act
    const type = getTemplateIdentifierType(code, 'this.obj.shared', 'shared');

    // Assert
    expect(type).toBe('boolean');
  });

  it('adds concrete properties to object members in nullish unions', () => {
    // Arrange
    const code = createVirtualCode(`
  <demo-widget>
    <p>{ obj?.shared }</p>
    <script>
      const self = this
      self.obj = null
      self.obj = { known: 'value' }
      self.obj.shared = true
    </script>
  </demo-widget>
  `);

    // Act
    const type = getTemplateIdentifierType(code, 'this.obj?.shared', 'shared');

    // Assert
    expect(type).toBe('boolean | undefined');
  });

  it('adds nested properties to object members in root unions', () => {
    // Arrange
    const code = createVirtualCode(`
  <demo-widget>
    <p>{ state.child.shared }</p>
    <script>
      const self = this
      self.state = { child: { left: 1 } }
      self.state = { child: { right: 'value' } }
      self.state.child.shared = true
    </script>
  </demo-widget>
  `);

    // Act
    const type = getTemplateIdentifierType(
      code,
      'this.state.child.shared',
      'shared',
    );

    // Assert
    expect(type).toBe('boolean');
  });

  it('preserves an existing nested JSDoc property type', () => {
    // Arrange
    const code = createVirtualCode(`
  <demo-widget>
    <p>{ parentObj.childObj }</p>
    <script>
      const self = this
      self.parentObj = {
        /** @type {string} */
        childObj: 'value'
      }
      self.parentObj.childObj = 1
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
    expect(type).toBe('string');
  });

  it('prioritizes a later nested JSDoc property type', () => {
    // Arrange
    const code = createVirtualCode(`
  <demo-widget>
    <p>{ parentObj.childObj }</p>
    <script>
      const self = this
      self.parentObj = { childObj: null }
      /** @type {string} */
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
    expect(type).toBe('string');
  });
});
