import { describe, expect, it } from 'vitest';
import {
  getTemplateIdentifierType,
  getTemplateSemanticDiagnostics,
  getTemplateSourceQuickInfo,
} from '../helpers/typescript';
import {
  createVirtualCode,
  getTemplateText,
  offsetOf,
} from '../helpers/virtualCode';

describe('each template expressions', () => {
  it('supports Riot v3 each item in collection syntax', () => {
    const code = createVirtualCode(`
  <demo-widget>
    <ul>
      <li each={ item in items } if={ item.visible }>{ item.name } { items.length } { parent.items.length }</li>
    </ul>
    <script>
      this.items = []
    </script>
  </demo-widget>
  `);

    const template = getTemplateText(code);

    expect(template).toContain(
      'type __riot_v3_each_context_0 = RiotV3TypedEachContext<__riot_v3_each_data_0',
    );
    expect(template).toContain(
      'const __riot_v3_each_collection_0 = this.items;',
    );
    expect(template).toContain('const item = this.item;');
    expect(template).toContain('item.visible');
    expect(template).toContain('item.name');
    expect(template).toContain('this.items.length');
    expect(template).toContain('this.parent.items.length');
  });

  it('supports Riot v3 each item and index syntax', () => {
    const code = createVirtualCode(`
  <demo-widget>
    <ul>
      <li each={ item, i in items }>{ i }: { item.name }</li>
    </ul>
  </demo-widget>
  `);

    const template = getTemplateText(code);

    expect(template).toContain(
      'type __riot_v3_each_data_0 = RiotV3EachData<{ item: RiotV3EachItem<typeof __riot_v3_each_collection_0>; i: RiotV3EachIndex<typeof __riot_v3_each_collection_0>; }',
    );
    expect(template).toContain('const item = this.item;');
    expect(template).toContain('const i = this.i;');
    expect(template).toContain('item.name');
  });

  it('infers Riot v3 each item and index types from array collections', () => {
    const code = createVirtualCode(`
  <demo-widget>
    <ul>
      <li each={ item, i in items }>{ item.name } { item.visible } { i.toFixed() }</li>
    </ul>
    <script>
      this.items = [{ name: 'Alice', visible: true }]
    </script>
  </demo-widget>
  `);

    const itemType = getTemplateIdentifierType(
      code,
      'void (item.name)',
      'item',
    );
    const indexType = getTemplateIdentifierType(code, 'i.toFixed', 'i');

    expect(itemType).toBe('{ name: string; visible: boolean; }');
    expect(indexType).toBe('number');
  });

  it('infers shorthand each context properties from array elements', () => {
    // Arrange
    const code = createVirtualCode(`
  <demo-widget>
    <ul>
      <li each={ items }>{ name } { this.active }</li>
    </ul>
    <script>
      this.items = [{ name: 'Alice', active: true }]
    </script>
  </demo-widget>
  `);

    // Act
    const nameType = getTemplateIdentifierType(
      code,
      'void (this.name)',
      'name',
    );
    const activeType = getTemplateIdentifierType(
      code,
      'void (this.active)',
      'active',
    );

    // Assert
    expect(nameType).toBe('string');
    expect(activeType).toBe('boolean');
  });

  it('prefers shorthand each item properties over parent properties', () => {
    // Arrange
    const code = createVirtualCode(`
  <demo-widget>
    <p each={ items }>{ name }</p>
    <script>
      this.name = 42
      this.items = [{ name: 'Alice' }]
    </script>
  </demo-widget>
  `);

    // Act
    const type = getTemplateIdentifierType(code, 'void (this.name)', 'name');

    // Assert
    expect(type).toBe('string');
  });

  it('inherits parent properties in shorthand each contexts', () => {
    // Arrange
    const code = createVirtualCode(`
  <demo-widget>
    <p each={ items }>{ title } { parent.title }</p>
    <script>
      this.title = 'People'
      this.items = [{ name: 'Alice' }]
    </script>
  </demo-widget>
  `);

    // Act
    const inheritedType = getTemplateIdentifierType(
      code,
      'void (this.title)',
      'title',
    );
    const parentType = getTemplateIdentifierType(
      code,
      'this.parent.title',
      'title',
    );

    // Assert
    expect(inheritedType).toBe('string');
    expect(parentType).toBe('string');
  });

  it('infers explicit each locals through this', () => {
    // Arrange
    const code = createVirtualCode(`
  <demo-widget>
    <ul>
      <li each={ item, i in items }>{ this.item.name } { this.i.toFixed() }</li>
    </ul>
    <script>
      this.items = [{ name: 'Alice' }]
    </script>
  </demo-widget>
  `);

    // Act
    const itemType = getTemplateIdentifierType(
      code,
      'void (this.item.name)',
      'item',
    );
    const indexMethodType = getTemplateIdentifierType(
      code,
      'this.i.toFixed()',
      'toFixed',
    );

    // Assert
    expect(itemType).toBe('{ name: string; }');
    expect(indexMethodType).toBe(
      '(fractionDigits?: number | undefined) => string',
    );
  });

  it('does not report explicit each locals as unused when referenced through this', () => {
    // Arrange
    const code = createVirtualCode(`
  <demo-widget>
    <p each={ item, i in items }>{ this.item.name } { this.i }</p>
    <script>
      this.items = [{ name: 'Alice' }]
    </script>
  </demo-widget>
  `);

    // Act
    const diagnostics = getTemplateSemanticDiagnostics([code], {
      noUnusedLocals: true,
    });

    // Assert
    expect(
      diagnostics.filter((diagnostic) => diagnostic.code === 6133),
    ).toEqual([]);
  });

  it('provides hover information for each locals referenced through this', () => {
    // Arrange
    const source = `
  <root>
    <div each={ message, i in list }>
      <p>{ this.message } { this.i }</p>
    </div>
    <script>
      this.list = ['Hi!']
    </script>
  </root>
  `;
    const code = createVirtualCode(source);

    // Act
    const messageQuickInfo = getTemplateSourceQuickInfo(
      code,
      offsetOf(source, 'message, i in list', 'message'),
    );
    const indexQuickInfo = getTemplateSourceQuickInfo(
      code,
      offsetOf(source, 'message, i in list', 'i in'),
    );

    // Assert
    expect(messageQuickInfo).toBe('const message: string');
    expect(indexQuickInfo).toBe('const i: number');
  });

  it('provides hover information for each locals referenced by bare names', () => {
    // Arrange
    const source = `
  <root>
    <div each={ message in list }>{ message }</div>
    <script>
      this.list = ['Hi!']
    </script>
  </root>
  `;
    const code = createVirtualCode(source);

    // Act
    const quickInfo = getTemplateSourceQuickInfo(
      code,
      offsetOf(source, 'message in list', 'message'),
    );

    // Assert
    expect(quickInfo).toBe('const message: string');
  });

  it('provides hover information for unused each locals', () => {
    // Arrange
    const source = `
  <root>
    <div each={ message in list }></div>
    <script>
      this.list = ['Hi!']
    </script>
  </root>
  `;
    const code = createVirtualCode(source);

    // Act
    const quickInfo = getTemplateSourceQuickInfo(
      code,
      offsetOf(source, 'message in list', 'message'),
    );

    // Assert
    expect(quickInfo).toBe('const message: string');
  });

  it('infers mixed shorthand and explicit nested each contexts', () => {
    // Arrange
    const code = createVirtualCode(`
  <demo-widget>
    <section each={ groups }>
      <p each={ child in children }>{ groupName } { child.label } { this.child.label }</p>
    </section>
    <script>
      this.groups = [{
        groupName: 'Group',
        children: [{ label: 'Child' }],
      }]
    </script>
  </demo-widget>
  `);

    // Act
    const parentItemType = getTemplateIdentifierType(
      code,
      'void (this.groupName)',
      'groupName',
    );
    const localType = getTemplateIdentifierType(
      code,
      'void (child.label)',
      'label',
    );
    const thisLocalType = getTemplateIdentifierType(
      code,
      'void (this.child.label)',
      'label',
    );

    // Assert
    expect(parentItemType).toBe('string');
    expect(localType).toBe('string');
    expect(thisLocalType).toBe('string');
  });

  it('infers shorthand items nested in explicit each contexts', () => {
    // Arrange
    const code = createVirtualCode(`
  <demo-widget>
    <section each={ group in groups }>
      <p each={ group.children }>{ label } { this.label } { group.name }</p>
    </section>
    <script>
      this.groups = [{
        name: 'Group',
        children: [{ label: 'Child' }],
      }]
    </script>
  </demo-widget>
  `);

    // Act
    const bareType = getTemplateIdentifierType(
      code,
      'void (this.label)',
      'label',
    );
    const explicitType = getTemplateIdentifierType(
      code,
      'void (group.name)',
      'name',
    );

    // Assert
    expect(bareType).toBe('string');
    expect(explicitType).toBe('string');
  });

  it('infers explicit each locals from parent collections', () => {
    // Arrange
    const code = createVirtualCode(`
  <root>
    <div each={ list }>
      <div each={ message, i in parent.list }>
        <p>{ message } { i.toFixed() }</p>
      </div>
    </div>
    <script>
      this.list = ['Hi!']
    </script>
  </root>
  `);

    // Act
    const messageType = getTemplateIdentifierType(
      code,
      'void (message)',
      'message',
    );
    const indexType = getTemplateIdentifierType(code, 'i.toFixed', 'i');

    // Assert
    expect(messageType).toBe('string');
    expect(indexType).toBe('number');
  });

  it('infers explicit each locals from this.parent collections', () => {
    // Arrange
    const code = createVirtualCode(`
  <root>
    <div each={ list }>
      <p each={ message in this.parent.list }>{ message }</p>
    </div>
    <script>
      this.list = ['Hi!']
    </script>
  </root>
  `);

    // Act
    const type = getTemplateIdentifierType(code, 'void (message)', 'message');

    // Assert
    expect(type).toBe('string');
  });

  it('infers collections from parent each item properties', () => {
    // Arrange
    const code = createVirtualCode(`
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
  `);

    // Act
    const type = getTemplateIdentifierType(
      code,
      'void (sibling.label)',
      'sibling',
    );

    // Assert
    expect(type).toBe('{ label: string; }');
  });

  it('infers collections through multiple parent contexts', () => {
    // Arrange
    const code = createVirtualCode(`
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
  `);

    // Act
    const type = getTemplateIdentifierType(code, 'void (item.name)', 'item');

    // Assert
    expect(type).toBe('{ name: string; }');
  });

  it('infers heterogeneous Riot v3 each item property types', () => {
    // Arrange
    const code = createVirtualCode(`
  <demo-widget>
    <p each={ item in items }>{ item.a }</p>
    <script>
      const self = this
      self.items = [{ a: 1 }, { a: 'a' }]
    </script>
  </demo-widget>
  `);

    // Act
    const type = getTemplateIdentifierType(code, 'item.a', 'a');

    // Assert
    expect(type).toBe('string | number');
  });

  it('resolves unions from repeated script property assignments', () => {
    // Arrange
    const code = createVirtualCode(`
  <demo-widget>
    <p>{ message }</p>
    <script>
      const self = this
      self.message = null
      if (this.opts.flag === true) {
        self.message = 'Hello'
      }
    </script>
  </demo-widget>
  `);

    // Act
    const type = getTemplateIdentifierType(
      code,
      'void (this.message)',
      'message',
    );

    // Assert
    expect(type).toBe('string | null');
  });

  it('resolves template method types from script JSDoc function assignments', () => {
    const code = createVirtualCode(`
  <demo-widget>
    <p each={ num in generateSerealNumbers(5) }>{ num }</p>
    <script>
      const self = this
      /**
       * @param {number} num
       * @return {number[]}
       */
      self.generateSerealNumbers = function (num) {
        return [...Array(num)].map((_, i) => i)
      }
    </script>
  </demo-widget>
  `);

    const methodType = getTemplateIdentifierType(
      code,
      'generateSerealNumbers(5)',
      'generateSerealNumbers',
    );
    const itemType = getTemplateIdentifierType(code, 'void (num)', 'num');

    expect(methodType).toBe('(num: number) => number[]');
    expect(itemType).toBe('number');
  });

  it('resolves template method types from JSDoc typed arrow function assignments', () => {
    const code = createVirtualCode(`
  <demo-widget>
    <p each={ num in generateSerealNumbers(5) }>{ num }</p>
    <script>
      const self = this
      /**
       * @type {(num: number) => number[]}
       */
      self.generateSerealNumbers = (num) => {
        return [...Array(num)].map((_, i) => i)
      }
    </script>
  </demo-widget>
  `);

    const methodType = getTemplateIdentifierType(
      code,
      'generateSerealNumbers(5)',
      'generateSerealNumbers',
    );
    const itemType = getTemplateIdentifierType(code, 'void (num)', 'num');

    expect(methodType).toBe('(num: number) => number[]');
    expect(itemType).toBe('number');
  });

  it('resolves template method types from JSDoc Riot v3 method syntax', () => {
    const code = createVirtualCode(`
  <demo-widget>
    <p each={ num in generateSerealNumbers(5) }>{ num }</p>
    <script>
      /**
       * @param {number} num
       * @return {number[]}
       */
      generateSerealNumbers(num) {
        return [...Array(num)].map((_, i) => i)
      }
    </script>
  </demo-widget>
  `);

    const methodType = getTemplateIdentifierType(
      code,
      'generateSerealNumbers(5)',
      'generateSerealNumbers',
    );
    const itemType = getTemplateIdentifierType(code, 'void (num)', 'num');

    expect(methodType).toBe('(num: number) => number[]');
    expect(itemType).toBe('number');
  });

  it('infers nested Riot v3 each item types from parent each locals', () => {
    const code = createVirtualCode(`
  <demo-widget>
    <ul>
      <li each={ group in groups }>
        <span each={ item in group.items }>{ group.name } { item.label }</span>
      </li>
    </ul>
    <script>
      this.groups = [{ name: 'Group', items: [{ label: 'Child' }] }]
    </script>
  </demo-widget>
  `);

    const groupType = getTemplateIdentifierType(
      code,
      'void (group.name)',
      'group',
    );
    const itemType = getTemplateIdentifierType(
      code,
      'void (item.label)',
      'item',
    );

    expect(groupType).toBe('{ name: string; items: { label: string; }[]; }');
    expect(itemType).toBe('{ label: string; }');
  });

  it('resolves template object member types from merged script assignments', () => {
    const code = createVirtualCode(`
  <demo-widget>
    <p>{ obj.hoge }</p>
    <p>{ obj.fuga }</p>
    <script>
      this.obj = { hoge: 'hoge' }
      this.obj.fuga = 'fuga'
    </script>
  </demo-widget>
  `);

    const type = getTemplateIdentifierType(code, 'obj.fuga', 'fuga');

    expect(type).toBe('string');
  });

  it('resolves template object member types from script JSDoc comments', () => {
    const code = createVirtualCode(`
  <demo-widget>
    <p>{ obj.fuga }</p>
    <script>
      const self = this
      self.obj = {
        hoge: 1,
        /** @type {number} */
        fuga: 'aaa',
        piyo: 2,
      }
    </script>
  </demo-widget>
  `);

    const type = getTemplateIdentifierType(code, 'obj.fuga', 'fuga');

    expect(type).toBe('number');
  });

  it('resolves template object member types from JSDoc object typedefs', () => {
    const code = createVirtualCode(`
  <demo-widget>
    <p>{ file.path }</p>
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
    </script>
  </demo-widget>
  `);

    const type = getTemplateIdentifierType(code, 'file.path', 'path');

    expect(type).toBe('string');
  });

  it('resolves template member types from JSDoc intersections', () => {
    const code = createVirtualCode(`
  <demo-widget>
    <p>{ item.count }</p>
    <script>
      /** @type {{ value: string } & { count: number }} */
      this.item = { value: 'value', count: 1 }
    </script>
  </demo-widget>
  `);

    const type = getTemplateIdentifierType(code, 'item.count', 'count');

    expect(type).toBe('number');
  });

  it('allows template object member access from dynamic script assignments', () => {
    const code = createVirtualCode(`
  <demo-widget>
    <p>{ obj.hoge }</p>
    <p>{ obj.fuga }</p>
    <script>
      const key = 'fuga'
      this.obj = { hoge: 'hoge' }
      this.obj[key] = 'fuga'
    </script>
  </demo-widget>
  `);

    const type = getTemplateIdentifierType(code, 'obj.fuga', 'fuga');

    expect(type).toBe('any');
  });

  it('does not declare unused nested each locals in parent expressions', () => {
    const code = createVirtualCode(`
  <demo-widget>
    <ul>
      <li each={ group in groups }>
        <span each={ item in group.items }>{ group.name } { item.label }</span>
      </li>
    </ul>
    <script>
      this.groups = [{ name: 'Group', items: [{ label: 'Child' }] }]
    </script>
  </demo-widget>
  `);

    const template = getTemplateText(code);

    expect(
      template,
    ).not.toContain(`const __riot_v3_each_collection_1 = group.items;
  const item = this.item;
  void (group.name);`);
  });

  it('keeps nested each locals invisible to outer expressions', () => {
    const code = createVirtualCode(`
  <demo-widget>
    <ul>
      <li each={ group in groups }>
        <span>{ item }</span>
        <em each={ item in group.items }>{ item.name }</em>
      </li>
    </ul>
  </demo-widget>
  `);

    const template = getTemplateText(code);

    expect(template).toContain('void (this.item);');
    expect(template).toContain('void (item.name);');
    expect(
      template,
    ).not.toContain(`const __riot_v3_each_collection_1 = group.items;
  const item = this.item;
  void (this.item);`);
  });

  it('supports Riot v3 each collection shorthand', () => {
    const code = createVirtualCode(`
  <demo-widget>
    <ul>
      <li each={ items }>{ name } { title } { parent.title }</li>
    </ul>
    <script>
      this.title = 'hello'
    </script>
  </demo-widget>
  `);

    const template = getTemplateText(code);

    expect(template).toContain('this.items');
    expect(template).toContain(
      'type __riot_v3_each_data_0 = RiotV3EachData<RiotV3EachItem<typeof __riot_v3_each_collection_0>',
    );
    expect(template).toContain('this.name');
    expect(template).toContain('this.title');
    expect(template).toContain('this.parent.title');
    expect(template).not.toContain('const item = undefined as any;');
    expect(template).not.toMatch(/\bthis\.item\b/);
  });

  it('supports Riot v3 nested each scopes', () => {
    const code = createVirtualCode(`
  <demo-widget>
    <ul>
      <li each={ group in groups }>
        <span>{ group.name } { title }</span>
        <em each={ item in group.items }>{ group.name } { item.name } { title } { parent.title }</em>
      </li>
    </ul>
    <script>
      this.groups = []
      this.title = 'hello'
    </script>
  </demo-widget>
  `);

    const template = getTemplateText(code);

    expect(template).toContain('this.groups');
    expect(template).toContain(
      'type __riot_v3_each_context_0 = RiotV3TypedEachContext<__riot_v3_each_data_0',
    );
    expect(template).toContain(
      'type __riot_v3_each_context_1 = RiotV3TypedEachContext<__riot_v3_each_data_1, __riot_v3_each_context_0>',
    );
    expect(template).toContain('group.items');
    expect(template).toContain('group.name');
    expect(template).toContain('item.name');
    expect(template).toContain('this.title');
    expect(template).toContain('this.parent.title');
    expect(template).not.toContain('this.group.items');
  });
});
