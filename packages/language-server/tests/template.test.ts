import { describe, expect, it } from 'vitest';
import { getTemplateIdentifierType } from './helpers/typescript';
import {
  createVirtualCode,
  expectTemplateIdentifierPrefixNotMapped,
  expectTemplateNavigationMappingsToBeDisabled,
  getTemplateText,
  offsetOf,
} from './helpers/virtualCode';

describe('template virtual code', () => {
  it('prefixes script this-property references with this', () => {
    const code = createVirtualCode(`
<demo-widget>
  <p>{ message }</p>
  <script>
    this.message = 'hello'
  </script>
</demo-widget>
`);

    const template = getTemplateText(code);

    expect(template).toContain('this.message');
  });

  it('prefixes script this-alias property references with this', () => {
    const code = createVirtualCode(`
<demo-widget>
  <p>{ message }</p>
  <script>
    const self = this
    self.message = 'hello'
  </script>
</demo-widget>
`);

    const template = getTemplateText(code);

    expect(template).toContain('this.message');
  });

  it('prefixes script this-alias function references with this', () => {
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

    const template = getTemplateText(code);

    expect(template).toContain('this.sum');
  });

  it('maps empty template expressions to this-member completion context', () => {
    const code = createVirtualCode(`
<demo-widget>
  <p>{ }</p>
  <script>
    this.message = 'hello'
  </script>
</demo-widget>
`);

    const template = getTemplateText(code);

    expect(template).toContain('this.');
  });

  it('does not map generated this-prefixes for non-empty template identifiers', () => {
    const source = `
<demo-widget>
  <button onclick={ handleClick }></button>
  <script>
    handleClick() {}
  </script>
</demo-widget>
`;
    const code = createVirtualCode(source);
    const templateOffset = offsetOf(source, 'handleClick');

    expectTemplateIdentifierPrefixNotMapped(
      code,
      templateOffset,
      'this.'.length,
    );
  });

  it('keeps template expression mappings out of TypeScript navigation', () => {
    const code = createVirtualCode(`
<demo-widget>
  <button onclick={ handleClick }></button>
  <script>
    handleClick() {}
  </script>
</demo-widget>
`);

    expectTemplateNavigationMappingsToBeDisabled(code);
  });
});

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

    expect(template).toContain('function(this: RiotV3EachContext_0)');
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

    expect(template).toContain('function(this: RiotV3EachContext_0)');
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
    expect(template).toContain('function(this: RiotV3EachContext_0)');
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
    expect(template).toContain('function(this: RiotV3EachContext_0)');
    expect(template).toContain('function(this: RiotV3EachContext_0_1)');
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

describe('class template expressions', () => {
  it('supports Riot v3 class shorthand expressions', () => {
    const code = createVirtualCode(`
<demo-widget>
  <p class={ active: isActive, disabled: isDisabled, is-ready: ready || fallback }>{ message }</p>
  <script>
    this.message = 'hello'
    this.isActive = true
    this.isDisabled = false
    this.ready = true
    this.fallback = false
  </script>
</demo-widget>
`);

    const template = getTemplateText(code);

    expect(template).toContain('this.message');
    expect(template).toContain('this.isActive');
    expect(template).toContain('this.isDisabled');
    expect(template).toContain('this.ready');
    expect(template).toContain('this.fallback');
    expect(template).not.toContain('this.active');
    expect(template).not.toContain('this.disabled');
    expect(template).not.toContain('this.is-ready');
  });

  it('keeps non-shorthand class expressions as normal template expressions', () => {
    const code = createVirtualCode(`
<demo-widget>
  <p class={ highlighted }></p>
  <p class={ isActive ? activeClass : inactiveClass }></p>
  <script>
    this.highlighted = 'highlighted'
    this.isActive = true
    this.activeClass = 'active'
    this.inactiveClass = 'inactive'
  </script>
</demo-widget>
`);

    const template = getTemplateText(code);

    expect(template).toContain('this.highlighted');
    expect(template).toContain('this.isActive');
    expect(template).toContain('this.activeClass');
    expect(template).toContain('this.inactiveClass');
  });

  it('supports Riot v3 class shorthand expressions in each scopes', () => {
    const code = createVirtualCode(`
<demo-widget>
  <ul>
    <li each={ item in items } class={ active: item.active, selected: selected }>{ item.name }</li>
  </ul>
  <script>
    this.items = []
    this.selected = true
  </script>
</demo-widget>
`);

    const template = getTemplateText(code);

    expect(template).toContain('function(this: RiotV3EachContext_0)');
    expect(template).toContain('item.active');
    expect(template).toContain('item.name');
    expect(template).toContain('this.selected');
    expect(template).not.toMatch(/\bthis\.item\b/);
    expect(template).not.toMatch(/\bthis\.active\b/);
  });
});

describe('Riot v3 instance members in template expressions', () => {
  it('resolves only safe Riot v3 instance members from template expressions', () => {
    const code = createVirtualCode(`
<demo-widget>
  <p>{ opts.title }</p>
  <p>{ refs.input }</p>
  <p>{ tags.child }</p>
  <p>{ parent }</p>
  <p>{ isMounted }</p>
  <p>{ _riot_id }</p>
  <p>{ update }</p>
  <p>{ mixin }</p>
  <p>{ mount }</p>
  <p>{ unmount }</p>
  <p>{ on }</p>
  <p>{ one }</p>
  <p>{ off }</p>
  <p>{ trigger }</p>
</demo-widget>
`);

    const template = getTemplateText(code);

    expect(template).toContain('this.opts.title');
    expect(template).toContain('({} as any).input');
    expect(template).toContain('({} as any).child');
    expect(template).not.toContain('this.refs');
    expect(template).not.toContain('this.tags');
    expect(template).not.toContain('this.parent');
    expect(template).not.toContain('this.isMounted');
    expect(template).not.toContain('this._riot_id');
    expect(template).not.toContain('this.update');
    expect(template).not.toContain('this.mixin');
    expect(template).not.toContain('this.mount');
    expect(template).not.toContain('this.unmount');
    expect(template).not.toContain('this.on');
    expect(template).not.toContain('this.one');
    expect(template).not.toContain('this.off');
    expect(template).not.toContain('this.trigger');
  });
});
