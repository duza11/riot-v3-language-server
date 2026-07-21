import { describe, expect, it } from 'vitest';
import {
  getTemplateIdentifierType,
  getTemplatePropertyDoesNotExistDiagnostics,
  getTemplateSemanticDiagnostics,
} from './helpers/typescript';
import {
  createVirtualCode,
  getGlobalTypesText,
  getInterfaceBody,
} from './helpers/virtualCode';

describe('global type virtual code', () => {
  it('does not infer component state from JavaScript line comments', () => {
    // Arrange
    const code = createVirtualCode(`
<demo-widget>
  <script>
    this.visible = true
    // this.hidden = true
    // hiddenMethod() {}
  </script>
</demo-widget>
`);

    // Act
    const globals = getGlobalTypesText(code);

    // Assert
    expect(globals).toContain('visible: boolean;');
    expect(globals).not.toContain('hidden:');
    expect(globals).not.toContain('hiddenMethod:');
  });

  it('does not infer component state from JavaScript block comments', () => {
    // Arrange
    const code = createVirtualCode(`
<demo-widget>
  <script>
    this.visible = true
    /*
      this.hidden = true
      hiddenMethod() {}
    */
  </script>
</demo-widget>
`);

    // Act
    const globals = getGlobalTypesText(code);

    // Assert
    expect(globals).toContain('visible: boolean;');
    expect(globals).not.toContain('hidden:');
    expect(globals).not.toContain('hiddenMethod:');
  });

  it('infers component state from script this-property assignments', () => {
    const code = createVirtualCode(`
<demo-widget>
  <p>{ message }</p>
  <script>
    this.message = 'hello'
  </script>
</demo-widget>
`);

    const globals = getGlobalTypesText(code);

    expect(globals).toContain('message: string;');
  });

  it('infers component state from script this-alias property assignments', () => {
    const code = createVirtualCode(`
<demo-widget>
  <p>{ message }</p>
  <script>
    const self = this
    self.message = 'hello'
  </script>
</demo-widget>
`);

    const globals = getGlobalTypesText(code);

    expect(globals).toContain('message: string;');
  });

  it('unions inferred component state types from repeated root assignments', () => {
    // Arrange
    const code = createVirtualCode(`
<demo-widget>
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
    const globals = getGlobalTypesText(code);

    // Assert
    expect(globals).toContain('message: null | string;');
  });

  it('deduplicates repeated inferred component state types', () => {
    // Arrange
    const code = createVirtualCode(`
<demo-widget>
  <script>
    this.value = 1
    this.value = 2
  </script>
</demo-widget>
`);

    // Act
    const globals = getGlobalTypesText(code);

    // Assert
    expect(globals).toContain('value: number;');
    expect(globals).not.toContain('value: number | number;');
  });

  it('keeps concrete inferred types when another assignment is any', () => {
    // Arrange
    const code = createVirtualCode(`
<demo-widget>
  <script>
    this.value = getInitialValue()
    this.value = true
  </script>
</demo-widget>
`);

    // Act
    const globals = getGlobalTypesText(code);

    // Assert
    expect(globals).toContain('value: boolean;');
    expect(globals).not.toContain('value: any | boolean;');
  });

  it('parenthesizes function types in inferred component state unions', () => {
    // Arrange
    const code = createVirtualCode(`
<demo-widget>
  <script>
    this.handler = null
    this.handler = () => true
  </script>
</demo-widget>
`);

    // Act
    const globals = getGlobalTypesText(code);

    // Assert
    expect(globals).toContain('handler: null | ((...args: any[]) => any);');
  });

  it('unions inferred object types from repeated root assignments', () => {
    // Arrange
    const code = createVirtualCode(`
<demo-widget>
  <script>
    this.value = { a: 1 }
    this.value = { b: 'b' }
  </script>
</demo-widget>
`);

    // Act
    const globals = getGlobalTypesText(code);

    // Assert
    expect(globals).toContain('value: { a: number; } | { b: string; };');
    expect(globals).not.toContain('value: { a: number; b: string; };');
  });

  it('keeps explicit JSDoc types after later inferred assignments', () => {
    // Arrange
    const code = createVirtualCode(`
<demo-widget>
  <script>
    /** @type {string | null} */
    this.message = null
    this.message = 1
  </script>
</demo-widget>
`);

    // Act
    const globals = getGlobalTypesText(code);

    // Assert
    expect(globals).toContain('message: string | null;');
    expect(globals).not.toContain('message: string | null | number;');
  });

  it('replaces earlier inferred types with explicit JSDoc types', () => {
    // Arrange
    const code = createVirtualCode(`
<demo-widget>
  <script>
    this.message = 1
    /** @type {string | null} */
    this.message = null
  </script>
</demo-widget>
`);

    // Act
    const globals = getGlobalTypesText(code);

    // Assert
    expect(globals).toContain('message: string | null;');
    expect(globals).not.toContain('message: number | string | null;');
  });

  it('infers component methods from script this-alias function assignments', () => {
    const code = createVirtualCode(`
<demo-widget>
  <p>{ sum }</p>
  <script>
    self = this
    self.sum = function (a, b) {
      return a + b
    }
  </script>
</demo-widget>
`);

    const globals = getGlobalTypesText(code);

    expect(globals).toContain('sum: (...args: any[]) => any;');
    expect(globals).not.toContain('unction: (...args: any[]) => any;');
  });

  it('infers component method types from JSDoc function assignments', () => {
    const code = createVirtualCode(`
<demo-widget>
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

    const globals = getGlobalTypesText(code);

    expect(globals).toContain(
      'generateSerealNumbers: (num: number) => number[];',
    );
  });

  it('infers component method types from JSDoc typed arrow function assignments', () => {
    const code = createVirtualCode(`
<demo-widget>
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

    const globals = getGlobalTypesText(code);

    expect(globals).toContain(
      'generateSerealNumbers: (num: number) => number[];',
    );
  });

  it('infers component method types from JSDoc Riot v3 method syntax', () => {
    const code = createVirtualCode(`
<demo-widget>
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

    const globals = getGlobalTypesText(code);

    expect(globals).toContain(
      'generateSerealNumbers: (num: number) => number[];',
    );
  });

  it('does not infer local function declarations as component methods', () => {
    const code = createVirtualCode(`
<demo-widget>
  <script>
    function greet () {
      console.log('Hello')
    }
  </script>
</demo-widget>
`);

    const globals = getGlobalTypesText(code);

    expect(globals).not.toContain('greet: (...args: any[]) => any;');
  });

  it('infers component methods from Riot v3 top-level method syntax', () => {
    const code = createVirtualCode(`
<demo-widget>
  <button onclick={ edit }>{ text }</button>
  <script>
    this.text = 'hello'
    edit(e) {
      this.text = e.target.value
    }
  </script>
</demo-widget>
`);

    const globals = getGlobalTypesText(code);

    expect(globals).toContain(
      'edit: (event: RiotV3Event<RiotV3NativeEvent<"click">, undefined>) => any;',
    );
  });

  it('infers state from multiple script blocks in one component scope', () => {
    const code = createVirtualCode(`
<demo-widget>
  <p>{ message } { count }</p>
  <script>
    const suffix = '!'
    this.message = 'hello' + suffix
  </script>
  <script>
    this.count = 1
    this.message = this.message + this.count
  </script>
</demo-widget>
`);

    const globals = getGlobalTypesText(code);

    expect(globals).toContain('message: string;');
    expect(globals).toContain('count: number;');
  });

  it('infers state from Riot v3 open syntax', () => {
    const code = createVirtualCode(`
<demo-widget>
  <p>{ message } { count }</p>
  <script>
    this.message = 'hello'
  </script>
  this.count = 1
</demo-widget>
`);

    const globals = getGlobalTypesText(code);

    expect(globals).toContain('count: number;');
  });

  it('defines Riot v3 script globals', () => {
    const code = createVirtualCode(`
<demo-widget>
  <script>
    const name = opts.name
    riot.mount('demo-widget')
  </script>
</demo-widget>
`);

    const globals = getGlobalTypesText(code);

    expect(globals).toContain('declare const riot: RiotV3Static;');
    expect(globals).toContain("declare const opts: RiotV3TagInstance['opts'];");
  });

  it('does not expose Riot v3 instance members as script locals', () => {
    const code = createVirtualCode(`
<demo-widget>
  <script>
    this.refs.input
    this.on('unmount', () => {})
    this.one('updated', () => {})
    this.off('mount')
    this.trigger('change')
    this.mount()
    this.unmount(true)
  </script>
</demo-widget>
`);

    const globals = getGlobalTypesText(code);

    expect(globals).not.toContain('declare const refs:');
    expect(globals).not.toContain('declare const on:');
    expect(globals).not.toContain('declare const one:');
    expect(globals).not.toContain('declare const off:');
    expect(globals).not.toContain('declare const trigger:');
    expect(globals).not.toContain('declare const mount:');
    expect(globals).not.toContain('declare const unmount:');
    expect(globals).not.toMatch(/\n\t(?:opts|refs|on): any;\n/);
  });

  it('defines Riot v3 tag instance members', () => {
    const code = createVirtualCode(`
<demo-widget>
  <script>
    this.update()
  </script>
</demo-widget>
`);

    const globals = getGlobalTypesText(code);

    expect(globals).toContain('update(data?: RiotV3Options): this;');
    expect(globals).toContain('mount(): this;');
    expect(globals).toContain('_riot_id: number;');
  });

  it('infers array component state types from script assignments', () => {
    const code = createVirtualCode(`
<demo-widget>
  <script>
    this.items = [{ name: 'Alice', visible: true }]
  </script>
</demo-widget>
`);

    const globals = getGlobalTypesText(code);

    expect(globals).toContain('items: { name: string; visible: boolean; }[];');
  });

  it('infers nested array component state types from script assignments', () => {
    const code = createVirtualCode(`
<demo-widget>
  <script>
    this.groups = [{ name: 'Group', items: [{ label: 'Child' }] }]
  </script>
</demo-widget>
`);

    const globals = getGlobalTypesText(code);

    expect(globals).toContain(
      'groups: { name: string; items: { label: string; }[]; }[];',
    );
  });

  it('parenthesizes heterogeneous object array element types', () => {
    // Arrange
    const code = createVirtualCode(`
<demo-widget>
  <script>
    this.items = [{ a: 1 }, { a: 'a' }]
  </script>
</demo-widget>
`);

    // Act
    const globals = getGlobalTypesText(code);

    // Assert
    expect(globals).toContain('items: ({ a: number; } | { a: string; })[];');
  });

  it('parenthesizes heterogeneous primitive array element types', () => {
    // Arrange
    const code = createVirtualCode(`
<demo-widget>
  <script>
    this.values = [1, 'a']
  </script>
</demo-widget>
`);

    // Act
    const globals = getGlobalTypesText(code);

    // Assert
    expect(globals).toContain('values: (number | string)[];');
  });

  it('parenthesizes function array element types', () => {
    // Arrange
    const code = createVirtualCode(`
<demo-widget>
  <script>
    this.callbacks = [() => 1]
  </script>
</demo-widget>
`);

    // Act
    const globals = getGlobalTypesText(code);

    // Assert
    expect(globals).toContain('callbacks: ((...args: any[]) => any)[];');
  });

  it('parenthesizes heterogeneous nested array element types', () => {
    // Arrange
    const code = createVirtualCode(`
<demo-widget>
  <script>
    this.values = [[1], ['a']]
  </script>
</demo-widget>
`);

    // Act
    const globals = getGlobalTypesText(code);

    // Assert
    expect(globals).toContain('values: (number[] | string[])[];');
  });

  it('parenthesizes heterogeneous arrays nested in object properties', () => {
    // Arrange
    const code = createVirtualCode(`
<demo-widget>
  <script>
    this.state = { values: [1, 'a'] }
  </script>
</demo-widget>
`);

    // Act
    const globals = getGlobalTypesText(code);

    // Assert
    expect(globals).toContain('state: { values: (number | string)[]; };');
  });

  it('infers object literal property types from JSDoc comments in script assignments', () => {
    const code = createVirtualCode(`
<demo-widget>
  <script>
    this.obj = {
      hoge: 1,
      /** @type {number} */
      fuga: 'aaa',
      piyo: 2,
    }
  </script>
</demo-widget>
`);

    const globals = getGlobalTypesText(code);

    expect(globals).toContain(
      'obj: { hoge: number; fuga: number; piyo: number; };',
    );
  });

  it('generates component-scoped aliases for JSDoc object typedefs', () => {
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
  </script>
</demo-widget>
`);

    const globals = getGlobalTypesText(code);

    expect(globals).toContain(
      'export type JSDocTypedef_0_F = { path: string; size: number; };',
    );
    expect(globals).toContain('file: JSDocTypedef_0_F;');
  });

  it('preserves JSDoc intersection types containing inline objects', () => {
    const code = createVirtualCode(`
<demo-widget>
  <script>
    /** @type {{ value: string } & { count: number }} */
    this.item = { value: 'value', count: 1 }
  </script>
</demo-widget>
`);

    const globals = getGlobalTypesText(code);

    expect(globals).toContain('item: { value: string } & { count: number };');
  });

  it('preserves JSDoc union types containing inline objects', () => {
    const code = createVirtualCode(`
<demo-widget>
  <script>
    /** @type {{ value: string } | { count: number }} */
    this.item = { value: 'value' }
  </script>
</demo-widget>
`);

    const globals = getGlobalTypesText(code);

    expect(globals).toContain('item: { value: string } | { count: number };');
  });

  it('does not merge separate JSDoc object union assignments as object literals', () => {
    // Arrange
    const code = createVirtualCode(`
<demo-widget>
  <script>
    /** @type {{ a: number } | { a: string }} */
    this.value = { a: 1 }
    /** @type {{ b: number } | { b: string }} */
    this.value = { b: 1 }
  </script>
</demo-widget>
`);

    // Act
    const globals = getGlobalTypesText(code);

    // Assert
    expect(globals).toContain('value: { a: number } | { a: string };');
    expect(globals).not.toContain('a: string; b: number');
  });

  it('does not merge separate JSDoc object intersection assignments as object literals', () => {
    // Arrange
    const code = createVirtualCode(`
<demo-widget>
  <script>
    /** @type {{ a: number } & { b: string }} */
    this.value = { a: 1, b: 'b' }
    /** @type {{ c: boolean } & { d: number }} */
    this.value = { c: true, d: 1 }
  </script>
</demo-widget>
`);

    // Act
    const globals = getGlobalTypesText(code);

    // Assert
    expect(globals).toContain('value: { a: number } & { b: string };');
    expect(globals).not.toContain('b: string; c: boolean');
  });

  it('does not merge nested assignments into JSDoc object unions', () => {
    // Arrange
    const code = createVirtualCode(`
<demo-widget>
  <script>
    /** @type {{ a: number } | { a: string }} */
    this.value = { a: 1 }
    this.value.extra = true
  </script>
</demo-widget>
`);

    // Act
    const globals = getGlobalTypesText(code);

    // Assert
    expect(globals).toContain('value: { a: number } | { a: string };');
    expect(globals).not.toContain('a: string; extra: boolean');
  });

  it('does not merge nested assignments into JSDoc object intersections', () => {
    // Arrange
    const code = createVirtualCode(`
<demo-widget>
  <script>
    /** @type {{ a: number } & { b: string }} */
    this.value = { a: 1, b: 'b' }
    this.value.extra = true
  </script>
</demo-widget>
`);

    // Act
    const globals = getGlobalTypesText(code);

    // Assert
    expect(globals).toContain('value: { a: number } & { b: string };');
    expect(globals).not.toContain('b: string; extra: boolean');
  });

  it('merges nested component state assignments into object literal types', () => {
    const code = createVirtualCode(`
<demo-widget>
  <script>
    this.obj = { hoge: 'hoge' }
    this.obj.fuga = 'fuga'
  </script>
</demo-widget>
`);

    const globals = getGlobalTypesText(code);

    expect(globals).toContain('obj: { hoge: string; fuga: string; };');
  });

  it('merges nested component state assignments through this aliases', () => {
    const code = createVirtualCode(`
<demo-widget>
  <script>
    const self = this
    self.obj = { hoge: 'hoge' }
    self.obj.fuga = 'fuga'
  </script>
</demo-widget>
`);

    const globals = getGlobalTypesText(code);

    expect(globals).toContain('obj: { hoge: string; fuga: string; };');
  });

  it('collects component state assignments after regular expression literals', () => {
    // Arrange
    const code = createVirtualCode(String.raw`
<demo-widget>
  <script>
    const self = this
    self.obj = { hoge: 1 }
    const quoted = /\"/
    self.obj.fuga = 'hello'
  </script>
</demo-widget>
`);

    // Act
    const globals = getGlobalTypesText(code);

    // Assert
    expect(globals).toContain('obj: { hoge: number; fuga: string; };');
  });

  it('keeps division expressions distinct from regular expression literals', () => {
    // Arrange
    const code = createVirtualCode(`
<demo-widget>
  <script>
    const self = this
    self.obj = { hoge: 1 }
    const ratio = 10 / 2
    self.obj.fuga = ratio
  </script>
</demo-widget>
`);

    // Act
    const globals = getGlobalTypesText(code);

    // Assert
    expect(globals).toContain('obj: { hoge: number; fuga: any; };');
  });

  it('merges string literal bracket component state assignments into object literal types', () => {
    const code = createVirtualCode(`
<demo-widget>
  <script>
    this.obj = { hoge: 'hoge' }
    this.obj['fuga'] = 'fuga'
  </script>
</demo-widget>
`);

    const globals = getGlobalTypesText(code);

    expect(globals).toContain('obj: { hoge: string; fuga: string; };');
  });

  it('allows dynamic bracket component state assignments on object literal types', () => {
    const code = createVirtualCode(`
<demo-widget>
  <script>
    const key = 'fuga'
    this.obj = { hoge: 'hoge' }
    this.obj[key] = 'fuga'
  </script>
</demo-widget>
`);

    const globals = getGlobalTypesText(code);

    expect(globals).toContain('obj: { hoge: string; [key: string]: any; };');
  });

  it('keeps component state scoped to each Riot v3 component', () => {
    const code = createVirtualCode(`
<first-widget>
  <p>{ message }</p>
  <script>
    this.message = 'hello'
  </script>
</first-widget>

<second-widget>
  <p>{ count }</p>
  <script>
    this.count = 1
  </script>
</second-widget>
`);

    const globals = getGlobalTypesText(code);
    const firstState = getInterfaceBody(globals, 'ComponentState_0');
    const secondState = getInterfaceBody(globals, 'ComponentState_1');

    expect(firstState).toContain('message: string;');
    expect(firstState).not.toContain('count:');
    expect(secondState).toContain('count: number;');
    expect(secondState).not.toContain('message:');
  });

  it('creates component-specific tag and template instance types', () => {
    const code = createVirtualCode(`
<first-widget>
  <script>
    this.message = 'hello'
  </script>
</first-widget>

<second-widget>
  <script>
    this.count = 1
  </script>
</second-widget>
`);

    const globals = getGlobalTypesText(code);

    expect(globals).toContain(
      'export interface TagInstance_0 extends RiotV3TagInstance, ComponentState_0 {}',
    );
    expect(globals).toContain(
      'export interface TemplateInstance_0 extends RiotV3TemplateInstance, ComponentState_0 {}',
    );
    expect(globals).toContain(
      'export interface TagInstance_1 extends RiotV3TagInstance, ComponentState_1 {}',
    );
    expect(globals).toContain(
      'export interface TemplateInstance_1 extends RiotV3TemplateInstance, ComponentState_1 {}',
    );
  });

  it('encapsulates component types in a file-specific module', () => {
    const code = createVirtualCode(
      `
<demo-widget>
  <script>
    this.message = 'hello'
  </script>
</demo-widget>
`,
      '/workspace/demo.tag',
    );

    const globals = getGlobalTypesText(code);

    expect(globals).toMatch(
      /declare module 'riot-v3:[^']+' \{\n\texport interface ComponentState_0 \{/,
    );
    expect(globals).toContain(
      'export interface TagInstance_0 extends RiotV3TagInstance, ComponentState_0 {}',
    );
    expect(globals).toContain(
      'export interface TemplateInstance_0 extends RiotV3TemplateInstance, ComponentState_0 {}',
    );
  });

  it('isolates component state types between tag files', () => {
    const firstCode = createVirtualCode(
      `
<test>
  <p>{ obj.hoge }</p>
  <script>
    const self = this
    self.obj = { hoge: 1 }
  </script>
</test>
`,
      '/workspace/test.tag',
    );
    const secondCode = createVirtualCode(
      `
<test2>
  <p>{ obj.fuga }</p>
  <script>
    const self = this
    self.obj = { fuga: 1 }
  </script>
</test2>
`,
      '/workspace/test2.tag',
    );
    expect(
      getTemplatePropertyDoesNotExistDiagnostics([firstCode, secondCode]),
    ).toEqual([]);
  });

  it('reports unknown object properties after any assignments by default', () => {
    // Arrange
    const code = createVirtualCode(`
<demo-widget>
  <p>{ data.dynamic }</p>
  <script>
    this.data = { known: 'value' }
    this.data = this.opts.data
  </script>
</demo-widget>
`);

    // Act
    const diagnostics = getTemplatePropertyDoesNotExistDiagnostics([code]);

    // Assert
    expect(diagnostics).toHaveLength(1);
  });

  it('allows dynamic properties from any assignments when enabled', () => {
    // Arrange
    const code = createVirtualCode(
      `
<demo-widget>
  <p>{ data.dynamic }</p>
  <script>
    this.data = { known: 'value' }
    this.data = this.opts.data
  </script>
</demo-widget>
`,
      undefined,
      { allowDynamicPropertiesFromAnyAssignments: true },
    );

    // Act
    const diagnostics = getTemplatePropertyDoesNotExistDiagnostics([code]);
    const globals = getGlobalTypesText(code);

    // Assert
    expect(diagnostics).toEqual([]);
    expect(globals).toContain(
      'data: { known: string; } & Record<string, any>;',
    );
  });

  it('preserves known property types when dynamic properties from any assignments are enabled', () => {
    // Arrange
    const code = createVirtualCode(
      `
<demo-widget>
  <p>{ data.known }</p>
  <script>
    this.data = { known: 'value' }
    this.data = this.opts.data
  </script>
</demo-widget>
`,
      undefined,
      { allowDynamicPropertiesFromAnyAssignments: true },
    );

    // Act
    const type = getTemplateIdentifierType(code, 'this.data.known', 'known');

    // Assert
    expect(type).toBe('string');
  });

  it('keeps inferred object types strict without any assignments', () => {
    // Arrange
    const code = createVirtualCode(
      `
<demo-widget>
  <p>{ data.dynamic }</p>
  <script>
    this.data = { known: 'value' }
    console.log(this.data.known)
  </script>
</demo-widget>
`,
      undefined,
      { allowDynamicPropertiesFromAnyAssignments: true },
    );

    // Act
    const diagnostics = getTemplatePropertyDoesNotExistDiagnostics([code]);

    // Assert
    expect(diagnostics).toHaveLength(1);
  });

  it('keeps explicit JSDoc object types strict after any assignments', () => {
    // Arrange
    const code = createVirtualCode(
      `
<demo-widget>
  <p>{ data.dynamic }</p>
  <script>
    /** @type {{ known: string }} */
    this.data = { known: 'value' }
    this.data = this.opts.data
  </script>
</demo-widget>
`,
      undefined,
      { allowDynamicPropertiesFromAnyAssignments: true },
    );

    // Act
    const diagnostics = getTemplatePropertyDoesNotExistDiagnostics([code]);

    // Assert
    expect(diagnostics).toHaveLength(1);
  });

  it('keeps null-initialized properties strict by default', () => {
    // Arrange
    const code = createVirtualCode(`
<demo-widget>
  <p>{ data?.dynamic }</p>
  <script>
    this.data = null
    this.data = this.opts.data
  </script>
</demo-widget>
`);

    // Act
    const diagnostics = getTemplatePropertyDoesNotExistDiagnostics([code]);

    // Assert
    expect(diagnostics).toHaveLength(1);
  });

  it('allows dynamic properties after null and any assignments when enabled', () => {
    // Arrange
    const code = createVirtualCode(
      `
<demo-widget>
  <p>{ data?.dynamic }</p>
  <script>
    this.data = null
    this.data = this.opts.data
  </script>
</demo-widget>
`,
      undefined,
      { allowDynamicPropertiesFromAnyAssignments: true },
    );

    // Act
    const diagnostics = getTemplateSemanticDiagnostics([code]);
    const globals = getGlobalTypesText(code);

    // Assert
    expect(diagnostics).toEqual([]);
    expect(globals).toContain('data: null | Record<string, any>;');
  });

  it('allows dynamic properties after nested null and any assignments', () => {
    // Arrange
    const code = createVirtualCode(
      `
<demo-widget>
  <p>{ parentObj.childObj?.dynamic }</p>
  <script>
    const self = this
    self.parentObj = { childObj: null }
    self.parentObj.childObj = self.opts.obj
  </script>
</demo-widget>
`,
      undefined,
      { allowDynamicPropertiesFromAnyAssignments: true },
    );

    // Act
    const diagnostics = getTemplateSemanticDiagnostics([code]);
    const globals = getGlobalTypesText(code);

    // Assert
    expect(diagnostics).toEqual([]);
    expect(globals).toContain(
      'parentObj: { childObj: null | Record<string, any>; };',
    );
  });

  it('allows dynamic properties on nested inferred object shapes', () => {
    // Arrange
    const code = createVirtualCode(
      `
<demo-widget>
  <p>{ parentObj.childObj.dynamic }</p>
  <script>
    const self = this
    self.parentObj = { childObj: { known: 'value' } }
    self.parentObj.childObj = self.opts.obj
  </script>
</demo-widget>
`,
      undefined,
      { allowDynamicPropertiesFromAnyAssignments: true },
    );

    // Act
    const diagnostics = getTemplateSemanticDiagnostics([code]);

    // Assert
    expect(diagnostics).toEqual([]);
  });

  it('preserves known nested property types after any assignments', () => {
    // Arrange
    const code = createVirtualCode(
      `
<demo-widget>
  <p>{ parentObj.childObj.known }</p>
  <script>
    const self = this
    self.parentObj = { childObj: { known: 'value' } }
    self.parentObj.childObj = self.opts.obj
  </script>
</demo-widget>
`,
      undefined,
      { allowDynamicPropertiesFromAnyAssignments: true },
    );

    // Act
    const type = getTemplateIdentifierType(
      code,
      'this.parentObj.childObj.known',
      'known',
    );

    // Assert
    expect(type).toBe('string');
  });

  it('allows dynamic properties at deeply nested assignment paths', () => {
    // Arrange
    const code = createVirtualCode(
      `
<demo-widget>
  <p>{ state.parent.child?.dynamic }</p>
  <script>
    const self = this
    self.state = { parent: { child: null } }
    self.state.parent.child = self.opts.child
  </script>
</demo-widget>
`,
      undefined,
      { allowDynamicPropertiesFromAnyAssignments: true },
    );

    // Act
    const diagnostics = getTemplateSemanticDiagnostics([code]);

    // Assert
    expect(diagnostics).toEqual([]);
  });

  it('keeps nested primitive properties strict after any assignments', () => {
    // Arrange
    const code = createVirtualCode(
      `
<demo-widget>
  <p>{ parentObj.childObj.dynamic }</p>
  <script>
    const self = this
    self.parentObj = { childObj: 'value' }
    self.parentObj.childObj = self.opts.obj
  </script>
</demo-widget>
`,
      undefined,
      { allowDynamicPropertiesFromAnyAssignments: true },
    );

    // Act
    const diagnostics = getTemplatePropertyDoesNotExistDiagnostics([code]);

    // Assert
    expect(diagnostics).toHaveLength(1);
  });

  it('keeps nested JSDoc properties strict after any assignments', () => {
    // Arrange
    const code = createVirtualCode(
      `
<demo-widget>
  <p>{ parentObj.childObj.dynamic }</p>
  <script>
    const self = this
    self.parentObj = {
      /** @type {{ known: string }} */
      childObj: { known: 'value' }
    }
    self.parentObj.childObj = self.opts.obj
  </script>
</demo-widget>
`,
      undefined,
      { allowDynamicPropertiesFromAnyAssignments: true },
    );

    // Act
    const diagnostics = getTemplatePropertyDoesNotExistDiagnostics([code]);

    // Assert
    expect(diagnostics).toHaveLength(1);
  });

  it('keeps null-only properties strict when they are read in scripts', () => {
    // Arrange
    const code = createVirtualCode(
      `
<demo-widget>
  <p>{ data.dynamic }</p>
  <script>
    this.data = null
    console.log(this.data?.dynamic)
  </script>
</demo-widget>
`,
      undefined,
      { allowDynamicPropertiesFromAnyAssignments: true },
    );

    // Act
    const globals = getGlobalTypesText(code);

    // Assert
    expect(globals).toContain('data: null;');
  });

  it('keeps undefined-only properties strict when they are read in scripts', () => {
    // Arrange
    const code = createVirtualCode(
      `
<demo-widget>
  <p>{ data.dynamic }</p>
  <script>
    this.data = undefined
    console.log(this.data?.dynamic)
  </script>
</demo-widget>
`,
      undefined,
      { allowDynamicPropertiesFromAnyAssignments: true },
    );

    // Act
    const globals = getGlobalTypesText(code);

    // Assert
    expect(globals).toContain('data: undefined;');
  });

  it('allows dynamic properties after undefined and any assignments when enabled', () => {
    // Arrange
    const code = createVirtualCode(
      `
<demo-widget>
  <p>{ data?.dynamic }</p>
  <script>
    this.data = undefined
    this.data = this.opts.data
  </script>
</demo-widget>
`,
      undefined,
      { allowDynamicPropertiesFromAnyAssignments: true },
    );

    // Act
    const diagnostics = getTemplateSemanticDiagnostics([code]);
    const globals = getGlobalTypesText(code);

    // Assert
    expect(diagnostics).toEqual([]);
    expect(globals).toContain('data: undefined | Record<string, any>;');
  });

  it('preserves nullability diagnostics for direct dynamic property access', () => {
    // Arrange
    const code = createVirtualCode(
      `
<demo-widget>
  <p>{ data.dynamic }</p>
  <script>
    this.data = null
    this.data = this.opts.data
  </script>
</demo-widget>
`,
      undefined,
      { allowDynamicPropertiesFromAnyAssignments: true },
    );

    // Act
    const diagnostics = getTemplateSemanticDiagnostics([code]);

    // Assert
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].messageText).toMatch(/possibly 'null'/);
  });

  it('preserves inferred object shapes in nullable dynamic unions', () => {
    // Arrange
    const code = createVirtualCode(
      `
<demo-widget>
  <p>{ data?.dynamic }</p>
  <script>
    this.data = null
    this.data = { known: 'value' }
    this.data = this.opts.data
  </script>
</demo-widget>
`,
      undefined,
      { allowDynamicPropertiesFromAnyAssignments: true },
    );

    // Act
    const diagnostics = getTemplateSemanticDiagnostics([code]);
    const globals = getGlobalTypesText(code);

    // Assert
    expect(diagnostics).toEqual([]);
    expect(globals).toContain(
      'data: null | { known: string; } & Record<string, any>;',
    );
  });

  it('keeps primitive properties strict after any assignments', () => {
    // Arrange
    const code = createVirtualCode(
      `
<demo-widget>
  <p>{ value.dynamic }</p>
  <script>
    this.value = 'known'
    this.value = this.opts.value
  </script>
</demo-widget>
`,
      undefined,
      { allowDynamicPropertiesFromAnyAssignments: true },
    );

    // Act
    const diagnostics = getTemplatePropertyDoesNotExistDiagnostics([code]);

    // Assert
    expect(diagnostics).toHaveLength(1);
  });
});
