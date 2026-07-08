import { describe, expect, it } from 'vitest';
import {
  createVirtualCode,
  getGlobalTypesText,
  getInterfaceBody,
} from './helpers/virtualCode';

describe('global type virtual code', () => {
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

    expect(globals).toContain('edit: (...args: any[]) => any;');
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

  it('creates nested each context types', () => {
    const code = createVirtualCode(`
<demo-widget>
  <ul>
    <li each={ group in groups }>
      <em each={ item in group.items }>{ item.name }</em>
    </li>
  </ul>
</demo-widget>
`);

    const globals = getGlobalTypesText(code);

    expect(globals).toContain(
      'interface RiotV3EachContext_0_1 extends RiotV3EachContext, RiotV3TemplateInstance_0',
    );
    expect(globals).toContain('parent: RiotV3EachContext_0;');
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
    const firstState = getInterfaceBody(globals, 'RiotV3ComponentState_0');
    const secondState = getInterfaceBody(globals, 'RiotV3ComponentState_1');

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
      'interface RiotV3TagInstance_0 extends RiotV3TagInstance, RiotV3ComponentState_0 {}',
    );
    expect(globals).toContain(
      'interface RiotV3TemplateInstance_0 extends RiotV3TemplateInstance, RiotV3ComponentState_0 {}',
    );
    expect(globals).toContain(
      'interface RiotV3TagInstance_1 extends RiotV3TagInstance, RiotV3ComponentState_1 {}',
    );
    expect(globals).toContain(
      'interface RiotV3TemplateInstance_1 extends RiotV3TemplateInstance, RiotV3ComponentState_1 {}',
    );
  });
});
