import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  getRiotV3ReferenceRanges,
  getRiotV3RenameEdits,
  getRiotV3RenameRange,
  RiotV3VirtualCode,
} from '../src/languagePlugin';

function createVirtualCode(source: string): RiotV3VirtualCode {
  return new RiotV3VirtualCode(ts.ScriptSnapshot.fromString(source));
}

function getEmbeddedText(code: RiotV3VirtualCode, id: string): string {
  const embedded = code.embeddedCodes.find((code) => code.id === id);
  if (!embedded) {
    throw new Error(`Embedded code "${id}" was not found.`);
  }
  return embedded.snapshot.getText(0, embedded.snapshot.getLength());
}

function getInterfaceBody(text: string, name: string): string {
  const match = text.match(
    new RegExp(`interface ${name}[^}]*{([\\s\\S]*?)\\n}`),
  );
  if (!match) {
    throw new Error(`Interface "${name}" was not found.`);
  }
  return match[1];
}

function getTemplateIdentifierType(
  code: RiotV3VirtualCode,
  marker: string,
  identifier: string,
): string {
  const text =
    getEmbeddedText(code, 'riot_v3_globals') +
    '\n' +
    getEmbeddedText(code, 'template');
  const markerOffset = text.indexOf(marker);
  if (markerOffset === -1) {
    throw new Error(`Marker "${marker}" was not found.`);
  }
  const markerIdentifierOffset = marker.indexOf(identifier);
  if (markerIdentifierOffset === -1) {
    throw new Error(`Identifier "${identifier}" was not found.`);
  }
  const identifierOffset = markerOffset + markerIdentifierOffset;
  const fileName = '/virtual/riot-template.ts';
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (
    requestedFileName,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) =>
    requestedFileName === fileName
      ? ts.createSourceFile(requestedFileName, text, languageVersion, true)
      : getSourceFile(
          requestedFileName,
          languageVersion,
          onError,
          shouldCreateNewSourceFile,
        );
  const program = ts.createProgram([fileName], options, host);
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) {
    throw new Error('Virtual TypeScript source was not created.');
  }
  let result: string | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isIdentifier(node) &&
      node.getStart(sourceFile) === identifierOffset
    ) {
      result = checker.typeToString(checker.getTypeAtLocation(node));
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!result) {
    throw new Error(`Type for "${identifier}" was not found.`);
  }
  return result;
}

describe('RiotV3VirtualCode', () => {
  describe('script and template virtual code', () => {
    it('infers template variables from script this-property assignments', () => {
      const code = createVirtualCode(`
<demo-widget>
  <p>{ message }</p>
  <script>
    this.message = 'hello'
  </script>
</demo-widget>
`);

      expect(getEmbeddedText(code, 'riot_v3_globals')).toContain(
        'message: string;',
      );
      expect(getEmbeddedText(code, 'template')).toContain('this.message');
    });

    it('infers template variables from script this-alias property assignments', () => {
      const code = createVirtualCode(`
<demo-widget>
  <p>{ message }</p>
  <script>
    const self = this
    self.message = 'hello'
  </script>
</demo-widget>
`);

      expect(getEmbeddedText(code, 'riot_v3_globals')).toContain(
        'message: string;',
      );
      expect(getEmbeddedText(code, 'template')).toContain('this.message');
    });

    it('infers template methods from script this-alias function assignments', () => {
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

      const globals = getEmbeddedText(code, 'riot_v3_globals');
      expect(globals).toContain('sum: (...args: any[]) => any;');
      expect(globals).not.toContain('unction: (...args: any[]) => any;');
      expect(getEmbeddedText(code, 'template')).toContain('this.sum');
      expect(getEmbeddedText(code, 'script_0')).toContain(
        'self.sum = function (a, b) {',
      );
      expect(getEmbeddedText(code, 'script_0')).not.toContain('this.unction');
    });

    it('keeps script function declarations as local functions', () => {
      const code = createVirtualCode(`
<demo-widget>
  <script>
    function greet () {
      console.log('Hello')
    }
  </script>
</demo-widget>
`);

      const globals = getEmbeddedText(code, 'riot_v3_globals');
      expect(globals).not.toContain('greet: (...args: any[]) => any;');
      expect(getEmbeddedText(code, 'script_0')).toContain(
        'function greet () {',
      );
      expect(getEmbeddedText(code, 'script_0')).not.toContain(
        'this.greet = function',
      );
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

      const template = code.embeddedCodes.find(
        (code) => code.id === 'template',
      );
      expect(
        template?.snapshot.getText(0, template.snapshot.getLength()),
      ).toContain('this.');
      expect(
        template?.mappings.some(
          (mapping) =>
            mapping.data.completion === true &&
            mapping.data.verification === false &&
            mapping.lengths.includes(0),
        ),
      ).toBe(true);
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
      const templateOffset = source.indexOf('handleClick');

      const template = code.embeddedCodes.find(
        (code) => code.id === 'template',
      );
      expect(
        template?.snapshot.getText(0, template.snapshot.getLength()),
      ).toContain('this.handleClick');
      expect(
        template?.mappings.some(
          (mapping) =>
            mapping.sourceOffsets.includes(templateOffset) &&
            mapping.lengths.includes(0) &&
            mapping.generatedLengths?.includes('this.'.length),
        ),
      ).toBe(false);
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

      const template = code.embeddedCodes.find(
        (code) => code.id === 'template',
      );
      expect(
        template?.mappings.some(
          (mapping) =>
            mapping.data.navigation === true &&
            mapping.lengths.some((length) => length > 0),
        ),
      ).toBe(false);
    });

    it('supports Riot v3 top-level method syntax in script blocks', () => {
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

      expect(getEmbeddedText(code, 'script_0')).toContain(
        'this.edit = function(e) {',
      );
      expect(getEmbeddedText(code, 'riot_v3_globals')).toContain(
        'edit: (...args: any[]) => any;',
      );
      expect(getEmbeddedText(code, 'template')).toContain('this.edit');
    });

    it('keeps static imports at the top level of script virtual code', () => {
      const code = createVirtualCode(`
<demo-widget>
  <p>{ message }</p>
  <script>
    import format from './format'
    this.message = format('hello')
    import('./lazy').then(this.update)
  </script>
</demo-widget>
`);

      const script = getEmbeddedText(code, 'script_0');
      expect(script.indexOf("import format from './format'")).toBeLessThan(
        script.indexOf('function __riot_v3_script_context'),
      );
      expect(script).toContain("this.message = format('hello')");
      expect(script).toContain("import('./lazy').then(this.update)");
    });

    it('keeps static imports from multiple script blocks and open syntax at the top level', () => {
      const code = createVirtualCode(`
<demo-widget>
  <p>{ message }</p>
  <script>
    import first from './first'
    this.message = first
  </script>
  <script>
    import second from './second'
    this.extra = second
  </script>
  import third from './third'
  this.more = third
</demo-widget>
`);

      const script = getEmbeddedText(code, 'script_0');
      const contextStart = script.indexOf('function __riot_v3_script_context');
      expect(script.indexOf("import first from './first'")).toBeLessThan(
        contextStart,
      );
      expect(script.indexOf("import second from './second'")).toBeLessThan(
        contextStart,
      );
      expect(script.indexOf("import third from './third'")).toBeLessThan(
        contextStart,
      );
      expect(script.indexOf('this.message = first')).toBeGreaterThan(
        contextStart,
      );
      expect(script.indexOf('this.extra = second')).toBeGreaterThan(
        contextStart,
      );
      expect(script.indexOf('this.more = third')).toBeGreaterThan(contextStart);
    });

    it('keeps generated script method this-prefixes away from mapped boundaries', () => {
      const code = createVirtualCode(`
<demo-widget>
  <button onclick={ handleClick }></button>
  <script>
    handleClick() {}
  </script>
</demo-widget>
`);

      const script = code.embeddedCodes.find((code) => code.id === 'script_0');
      if (!script) {
        throw new Error('script_0 was not found.');
      }
      const scriptText = script.snapshot.getText(
        0,
        script.snapshot.getLength(),
      );
      const thisOffset = scriptText.indexOf('this.handleClick');
      expect(thisOffset).toBeGreaterThan(-1);
      for (const mapping of script.mappings) {
        for (let index = 0; index < mapping.generatedOffsets.length; index++) {
          expect(mapping.generatedOffsets[index]).not.toBe(thisOffset);
          expect(
            mapping.generatedOffsets[index] +
              (mapping.generatedLengths?.[index] ?? mapping.lengths[index]),
          ).not.toBe(thisOffset);
        }
      }
    });

    it('combines multiple Riot v3 script blocks in one component scope', () => {
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

      const script = getEmbeddedText(code, 'script_0');
      expect(
        code.embeddedCodes.filter((code) => code.id.startsWith('script_')),
      ).toHaveLength(1);
      expect(script).toContain("const suffix = '!'");
      expect(script).toContain("this.message = 'hello' + suffix");
      expect(script).toContain('this.count = 1');
      expect(script).toContain('this.message = this.message + this.count');
      expect(script.indexOf("const suffix = '!'")).toBeLessThan(
        script.indexOf('this.count = 1'),
      );
      expect(getEmbeddedText(code, 'riot_v3_globals')).toContain(
        'message: string;',
      );
      expect(getEmbeddedText(code, 'riot_v3_globals')).toContain(
        'count: number;',
      );
      expect(getEmbeddedText(code, 'template')).toContain('this.message');
      expect(getEmbeddedText(code, 'template')).toContain('this.count');
    });

    it('supports Riot v3 open syntax after the last template element', () => {
      const code = createVirtualCode(`
<demo-widget>
  <p>{ message } { count }</p>
  <script>
    this.message = 'hello'
  </script>
  this.count = 1
</demo-widget>
`);

      const script = getEmbeddedText(code, 'script_0');
      expect(script).toContain("this.message = 'hello'");
      expect(script).toContain('this.count = 1');
      expect(script.indexOf("this.message = 'hello'")).toBeLessThan(
        script.indexOf('this.count = 1'),
      );
      expect(getEmbeddedText(code, 'riot_v3_globals')).toContain(
        'count: number;',
      );
      expect(getEmbeddedText(code, 'template')).toContain('this.count');
    });

    it('supports Riot v3 open syntax without script blocks', () => {
      const code = createVirtualCode(`
<demo-widget>
  <p>{ message }</p>
  this.message = 'hello'
</demo-widget>
`);

      expect(getEmbeddedText(code, 'script_0')).toContain(
        "this.message = 'hello'",
      );
      expect(getEmbeddedText(code, 'riot_v3_globals')).toContain(
        'message: string;',
      );
      expect(getEmbeddedText(code, 'template')).toContain('this.message');
    });

    it('keeps Riot v3 open syntax method bodies out of template expressions', () => {
      const code = createVirtualCode(`
<demo-widget>
  <p>{ count }</p>
  <script>
    this.count = 0
  </script>
  increment() {
    if (this.count < 10) this.count++
  }
</demo-widget>
`);

      const script = getEmbeddedText(code, 'script_0');
      expect(script).toContain('this.increment = function() {');
      expect(script).toContain('if (this.count < 10) this.count++');
      expect(getEmbeddedText(code, 'template')).toContain('this.count');
      expect(getEmbeddedText(code, 'template')).not.toContain('void (if');
    });

    it('exposes only Riot v3 opts as a script local', () => {
      const code = createVirtualCode(`
<demo-widget>
  <script>
    const name = opts.name
    this.opts.name
    this.refs.input
    this.on('unmount', () => {})
    this.one('updated', () => {})
    this.off('mount')
    this.trigger('change', name)
    this.update({ name })
    this.unmount(true)
    riot.mount('demo-widget')
  </script>
</demo-widget>
`);

      const globals = getEmbeddedText(code, 'riot_v3_globals');
      expect(globals).toContain('declare const riot: RiotV3Static;');
      expect(globals).toContain(
        "declare const opts: RiotV3TagInstance['opts'];",
      );
      expect(globals).not.toContain('declare const refs:');
      expect(globals).not.toContain('declare const on:');
      expect(globals).not.toContain('declare const one:');
      expect(globals).not.toContain('declare const off:');
      expect(globals).not.toContain('declare const trigger:');
      expect(globals).not.toContain('declare const mount:');
      expect(globals).not.toContain('declare const unmount:');
      expect(globals).toContain('update(data?: RiotV3Options): this;');
      expect(globals).toContain('mount(): this;');
      expect(globals).toContain('_riot_id: number;');
      expect(globals).not.toMatch(/\n\t(?:opts|refs|on): any;\n/);
    });

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

      const template = getEmbeddedText(code, 'template');
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

  describe('each expressions', () => {
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

      const template = getEmbeddedText(code, 'template');
      expect(template).toContain('function(this: RiotV3EachContext_0)');
      expect(template).toContain('this.items');
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

      const template = getEmbeddedText(code, 'template');
      expect(template).toContain('function(this: RiotV3EachContext_0)');
      expect(template).toContain('this.items');
      expect(template).toContain(
        'const __riot_v3_each_collection_0 = this.items;',
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

      const globals = getEmbeddedText(code, 'riot_v3_globals');
      expect(globals).toContain(
        'items: { name: string; visible: boolean; }[];',
      );
      expect(getTemplateIdentifierType(code, 'void (item.name)', 'item')).toBe(
        '{ name: string; visible: boolean; }',
      );
      expect(getTemplateIdentifierType(code, 'i.toFixed', 'i')).toBe('number');
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

      const globals = getEmbeddedText(code, 'riot_v3_globals');
      const template = getEmbeddedText(code, 'template');
      expect(globals).toContain(
        'groups: { name: string; items: { label: string; }[]; }[];',
      );
      expect(
        template,
      ).not.toContain(`const __riot_v3_each_collection_1 = group.items;
const item = undefined as unknown as RiotV3EachItem<typeof __riot_v3_each_collection_1>;
void (group.name);`);
      expect(
        getTemplateIdentifierType(code, 'void (group.name)', 'group'),
      ).toBe('{ name: string; items: { label: string; }[]; }');
      expect(getTemplateIdentifierType(code, 'void (item.label)', 'item')).toBe(
        '{ label: string; }',
      );
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

      const template = getEmbeddedText(code, 'template');
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

      const globals = getEmbeddedText(code, 'riot_v3_globals');
      const template = getEmbeddedText(code, 'template');
      expect(globals).toContain(
        'interface RiotV3EachContext_0_1 extends RiotV3EachContext, RiotV3TemplateInstance_0',
      );
      expect(globals).toContain('parent: RiotV3EachContext_0;');
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

  describe('class expressions', () => {
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

      const template = getEmbeddedText(code, 'template');
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

      const template = getEmbeddedText(code, 'template');
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

      const template = getEmbeddedText(code, 'template');
      expect(template).toContain('function(this: RiotV3EachContext_0)');
      expect(template).toContain('item.active');
      expect(template).toContain('item.name');
      expect(template).toContain('this.selected');
      expect(template).not.toMatch(/\bthis\.item\b/);
      expect(template).not.toMatch(/\bthis\.active\b/);
    });
  });

  describe('component scopes', () => {
    it('keeps script properties scoped to each Riot v3 component', () => {
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

      const globals = getEmbeddedText(code, 'riot_v3_globals');
      const firstState = getInterfaceBody(globals, 'RiotV3ComponentState_0');
      const secondState = getInterfaceBody(globals, 'RiotV3ComponentState_1');
      expect(firstState).toContain('message: string;');
      expect(firstState).not.toContain('count:');
      expect(secondState).toContain('count: number;');
      expect(secondState).not.toContain('message:');
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

      expect(getEmbeddedText(code, 'script_0')).toContain(
        '@this {RiotV3TagInstance_0}',
      );
      expect(getEmbeddedText(code, 'script_1')).toContain(
        '@this {RiotV3TagInstance_1}',
      );
      expect(getEmbeddedText(code, 'template_0')).toContain(
        'this: RiotV3TemplateInstance_0',
      );
      expect(getEmbeddedText(code, 'template_1')).toContain(
        'this: RiotV3TemplateInstance_1',
      );
    });
  });

  describe('rename and references', () => {
    it('adds rename edits between script methods and template references', () => {
      const source = `
<demo-widget>
  <button onclick={ edit }>{ text }</button>
  <p>{ parent.edit }</p>
  <script>
    this.text = 'hello'
    edit(e) {
      this.text = e.target.value
    }
  </script>
</demo-widget>

<other-widget>
  <button onclick={ edit }></button>
  <script>
    edit() {}
  </script>
</other-widget>
`;
      const scriptEdits = getRiotV3RenameEdits(
        source,
        source.indexOf('edit(e)'),
        'updateText',
      );
      expect(
        scriptEdits.map((edit) => source.slice(edit.start, edit.end)),
      ).toEqual(['edit', 'edit']);
      expect(scriptEdits.every((edit) => edit.newText === 'updateText')).toBe(
        true,
      );
      expect(scriptEdits.map((edit) => edit.start)).toEqual([
        source.indexOf('edit(e)'),
        source.indexOf('onclick={ edit }') + 'onclick={ '.length,
      ]);

      const templateEdits = getRiotV3RenameEdits(
        source,
        source.indexOf('onclick={ edit }') + 'onclick={ '.length,
        'updateText',
      );
      expect(
        templateEdits.map((edit) => source.slice(edit.start, edit.end)),
      ).toEqual(['edit', 'edit']);
      expect(templateEdits.every((edit) => edit.newText === 'updateText')).toBe(
        true,
      );
      expect(templateEdits.map((edit) => edit.start)).toEqual(
        scriptEdits.map((edit) => edit.start),
      );
    });

    it('adds rename edits between script this-alias fields and template references', () => {
      const source = `
<demo-widget>
  <p>{ message }</p>
  <script>
    const self = this
    self.message = 'hello'
  </script>
</demo-widget>
`;
      const scriptEdits = getRiotV3RenameEdits(
        source,
        source.indexOf('self.message') + 'self.'.length,
        'title',
      );
      expect(
        scriptEdits.map((edit) => source.slice(edit.start, edit.end)),
      ).toEqual(['message', 'message']);
      expect(scriptEdits.every((edit) => edit.newText === 'title')).toBe(true);
      expect(scriptEdits.map((edit) => edit.start)).toEqual([
        source.indexOf('self.message') + 'self.'.length,
        source.indexOf('{ message }') + '{ '.length,
      ]);

      const templateEdits = getRiotV3RenameEdits(
        source,
        source.indexOf('{ message }') + '{ '.length,
        'title',
      );
      expect(
        templateEdits.map((edit) => source.slice(edit.start, edit.end)),
      ).toEqual(['message', 'message']);
      expect(templateEdits.map((edit) => edit.start)).toEqual(
        scriptEdits.map((edit) => edit.start),
      );
    });

    it('adds reference ranges between script this-alias function assignments and template references', () => {
      const source = `
<demo-widget>
  <p>{ sum }</p>
  <script>
    self = this
    self.sum = function(a, b) {
      return a + b
    }
  </script>
</demo-widget>
`;
      const scriptOffset = source.indexOf('self.sum') + 'self.'.length;
      const templateOffset = source.indexOf('{ sum }') + '{ '.length;
      const expectedOffsets = [scriptOffset, templateOffset];

      expect(
        getRiotV3ReferenceRanges(source, scriptOffset).map(
          (reference) => reference.start,
        ),
      ).toEqual(expectedOffsets);
      expect(
        getRiotV3ReferenceRanges(source, templateOffset).map(
          (reference) => reference.start,
        ),
      ).toEqual(expectedOffsets);
    });

    it('adds rename edits across template references, script blocks, and open syntax aliases', () => {
      const source = `
<demo-widget>
  <p>{ message }</p>
  <script>
    const self = this
    this.message = 'hello'
  </script>
  <script>
    const suffix = '!'
  </script>
  self.message = suffix
</demo-widget>
`;
      const templateOffset = source.indexOf('{ message }') + '{ '.length;
      const thisOffset = source.indexOf('this.message') + 'this.'.length;
      const selfOffset = source.indexOf('self.message') + 'self.'.length;
      const expectedOffsets = [thisOffset, selfOffset, templateOffset];
      expect(
        getRiotV3RenameEdits(source, templateOffset, 'title').map(
          (edit) => edit.start,
        ),
      ).toEqual(expectedOffsets);
      expect(
        getRiotV3RenameEdits(source, thisOffset, 'title').map(
          (edit) => edit.start,
        ),
      ).toEqual(expectedOffsets);
      expect(
        getRiotV3RenameEdits(source, selfOffset, 'title').map(
          (edit) => edit.start,
        ),
      ).toEqual(expectedOffsets);
      expect(
        getRiotV3ReferenceRanges(source, templateOffset).map(
          (reference) => reference.start,
        ),
      ).toEqual(expectedOffsets);
      expect(
        getRiotV3ReferenceRanges(source, thisOffset).map(
          (reference) => reference.start,
        ),
      ).toEqual(expectedOffsets);
      expect(
        getRiotV3ReferenceRanges(source, selfOffset).map(
          (reference) => reference.start,
        ),
      ).toEqual(expectedOffsets);
    });

    it('adds rename edits for Riot v3 each local variables', () => {
      const source = `
<demo-widget>
  <ul>
    <li each={ item, i in items }>{ i }: { item.name }</li>
  </ul>
</demo-widget>
`;
      const itemDefinitionOffset = source.indexOf('item, i in items');
      const itemReferenceOffset = source.indexOf('{ item.name }') + '{ '.length;
      expect(getRiotV3RenameRange(source, itemDefinitionOffset)).toEqual({
        start: itemDefinitionOffset,
        end: itemDefinitionOffset + 'item'.length,
      });
      const definitionEdits = getRiotV3RenameEdits(
        source,
        itemDefinitionOffset,
        'entry',
      );
      expect(
        definitionEdits.map((edit) => source.slice(edit.start, edit.end)),
      ).toEqual(['item', 'item']);
      expect(definitionEdits.every((edit) => edit.newText === 'entry')).toBe(
        true,
      );
      expect(definitionEdits.map((edit) => edit.start)).toEqual([
        itemDefinitionOffset,
        itemReferenceOffset,
      ]);

      const referenceEdits = getRiotV3RenameEdits(
        source,
        itemReferenceOffset,
        'entry',
      );
      expect(
        referenceEdits.map((edit) => source.slice(edit.start, edit.end)),
      ).toEqual(['item', 'item']);
      expect(referenceEdits.map((edit) => edit.start)).toEqual(
        definitionEdits.map((edit) => edit.start),
      );
    });

    it('keeps shadowed Riot v3 each local variables separate during rename', () => {
      const source = `
<demo-widget>
  <ul>
    <li each={ item in items }>
      <span>{ item.name }</span>
      <em each={ item in item.children }>{ item.name }</em>
      <strong>{ item.label }</strong>
    </li>
  </ul>
</demo-widget>
`;
      const outerDefinitionOffset = source.indexOf('item in items');
      const outerSpanOffset = source.indexOf('{ item.name }') + '{ '.length;
      const outerCollectionOffset = source.indexOf('item.children');
      const outerStrongOffset = source.indexOf('{ item.label }') + '{ '.length;
      const innerDefinitionOffset = source.indexOf('item in item.children');
      const innerReferenceOffset =
        source.lastIndexOf('{ item.name }') + '{ '.length;

      const outerEdits = getRiotV3RenameEdits(
        source,
        outerDefinitionOffset,
        'group',
      );
      expect(outerEdits.map((edit) => edit.start)).toEqual([
        outerDefinitionOffset,
        outerSpanOffset,
        outerCollectionOffset,
        outerStrongOffset,
      ]);
      expect(
        outerEdits.map((edit) => source.slice(edit.start, edit.end)),
      ).toEqual(['item', 'item', 'item', 'item']);

      const innerEdits = getRiotV3RenameEdits(
        source,
        innerDefinitionOffset,
        'child',
      );
      expect(innerEdits.map((edit) => edit.start)).toEqual([
        innerDefinitionOffset,
        innerReferenceOffset,
      ]);
      expect(
        innerEdits.map((edit) => source.slice(edit.start, edit.end)),
      ).toEqual(['item', 'item']);
    });

    it('keeps shadowed Riot v3 each local variables separate in references', () => {
      const source = `
<demo-widget>
  <ul>
    <li each={ item in items }>
      <span>{ item.name }</span>
      <em each={ item in item.children }>{ item.name }</em>
      <strong>{ item.label }</strong>
    </li>
  </ul>
</demo-widget>
`;
      const outerDefinitionOffset = source.indexOf('item in items');
      const outerSpanOffset = source.indexOf('{ item.name }') + '{ '.length;
      const outerCollectionOffset = source.indexOf('item.children');
      const outerStrongOffset = source.indexOf('{ item.label }') + '{ '.length;
      const innerDefinitionOffset = source.indexOf('item in item.children');
      const innerReferenceOffset =
        source.lastIndexOf('{ item.name }') + '{ '.length;

      const outerReferences = getRiotV3ReferenceRanges(source, outerSpanOffset);
      expect(outerReferences.map((reference) => reference.start)).toEqual([
        outerDefinitionOffset,
        outerSpanOffset,
        outerCollectionOffset,
        outerStrongOffset,
      ]);
      expect(
        getRiotV3ReferenceRanges(source, outerDefinitionOffset).map(
          (reference) => reference.start,
        ),
      ).toEqual([
        outerDefinitionOffset,
        outerSpanOffset,
        outerCollectionOffset,
        outerStrongOffset,
      ]);

      const innerReferences = getRiotV3ReferenceRanges(
        source,
        innerReferenceOffset,
      );
      expect(innerReferences.map((reference) => reference.start)).toEqual([
        innerDefinitionOffset,
        innerReferenceOffset,
      ]);
    });
  });
});
