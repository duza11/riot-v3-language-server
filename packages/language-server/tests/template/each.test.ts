import { describe, expect, it } from 'vitest';
import { getTemplateIdentifierType } from '../helpers/typescript';
import { createVirtualCode, getTemplateText } from '../helpers/virtualCode';

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
      "function(this: import('riot-v3:anonymous').EachContext_0)",
    );
    expect(template).toContain(
      'const __riot_v3_each_collection_0 = this.items;',
    );
    expect(template).toContain(
      'const item = undefined as unknown as RiotV3EachItem<typeof __riot_v3_each_collection_0>;',
    );
    expect(template).toContain('item.visible');
    expect(template).toContain('item.name');
    expect(template).toContain('this.items.length');
    expect(template).toContain('this.parent.items.length');
    expect(template).not.toMatch(/\bthis\.item\b/);
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
      "function(this: import('riot-v3:anonymous').EachContext_0)",
    );
    expect(template).toContain(
      'const item = undefined as unknown as RiotV3EachItem<typeof __riot_v3_each_collection_0>;',
    );
    expect(template).toContain(
      'const i = undefined as unknown as RiotV3EachIndex<typeof __riot_v3_each_collection_0>;',
    );
    expect(template).toContain('item.name');
    expect(template).not.toMatch(/\bthis\.item\b/);
    expect(template).not.toMatch(/\bthis\.i\b/);
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
  const item = undefined as unknown as RiotV3EachItem<typeof __riot_v3_each_collection_1>;
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
  const item = undefined as unknown as RiotV3EachItem<typeof __riot_v3_each_collection_1>;
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
      "function(this: import('riot-v3:anonymous').EachContext_0)",
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
      "function(this: import('riot-v3:anonymous').EachContext_0)",
    );
    expect(template).toContain(
      "function(this: import('riot-v3:anonymous').EachContext_0_1)",
    );
    expect(template).toContain('group.items');
    expect(template).toContain('group.name');
    expect(template).toContain('item.name');
    expect(template).toContain('this.title');
    expect(template).toContain('this.parent.title');
    expect(template).not.toContain('this.group.items');
    expect(template).not.toMatch(/\bthis\.group\b/);
    expect(template).not.toMatch(/\bthis\.item\b/);
  });
});
