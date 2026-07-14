import { describe, expect, it } from 'vitest';
import { getScriptIdentifierType } from './helpers/typescript';
import {
  createVirtualCode,
  expectGeneratedOffsetNotOnMappedBoundaries,
  getScriptText,
} from './helpers/virtualCode';

describe('script virtual code', () => {
  it('keeps this-alias function assignments intact', () => {
    const code = createVirtualCode(`
<demo-widget>
  <script>
    self = this
    self.sum = function (a, b) {
      return a + b
    }
  </script>
</demo-widget>
`);

    const script = getScriptText(code);

    expect(script).toContain('self.sum = function (a, b) {');
    expect(script).not.toContain('this.unction');
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

    const script = getScriptText(code);

    expect(script).toContain('function greet () {');
    expect(script).not.toContain('this.greet = function');
  });

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

  it('converts Riot v3 top-level method syntax', () => {
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

    const script = getScriptText(code);

    expect(script).toContain('this.edit = function(e) {');
  });

  it('keeps static imports before the script context', () => {
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

    const script = getScriptText(code);
    const contextStart = script.indexOf('function __riot_v3_script_context');

    expect(script.indexOf("import format from './format'")).toBeLessThan(
      contextStart,
    );
    expect(script).toContain("this.message = format('hello')");
    expect(script).toContain("import('./lazy').then(this.update)");
  });

  it('does not hoist static imports from JavaScript comments', () => {
    // Arrange
    const code = createVirtualCode(`
<demo-widget>
  <script>
    /*
      import hidden from './hidden'
    */
    import visible from './visible'
    this.message = visible
  </script>
</demo-widget>
`);

    // Act
    const script = getScriptText(code);
    const contextStart = script.indexOf('function __riot_v3_script_context');

    // Assert
    expect(script.indexOf("import visible from './visible'")).toBeLessThan(
      contextStart,
    );
    expect(script.indexOf("import hidden from './hidden'")).toBeGreaterThan(
      contextStart,
    );
  });

  it('keeps static imports from multiple script sources before the script context', () => {
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

    const script = getScriptText(code);
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
  });

  it('keeps non-import code from multiple script sources inside the script context', () => {
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

    const script = getScriptText(code);
    const contextStart = script.indexOf('function __riot_v3_script_context');

    expect(script.indexOf('this.message = first')).toBeGreaterThan(
      contextStart,
    );
    expect(script.indexOf('this.extra = second')).toBeGreaterThan(contextStart);
    expect(script.indexOf('this.more = third')).toBeGreaterThan(contextStart);
  });

  it('keeps generated method this-prefixes away from mapped boundaries', () => {
    const code = createVirtualCode(`
<demo-widget>
  <button onclick={ handleClick }></button>
  <script>
    handleClick() {}
  </script>
</demo-widget>
`);

    expectGeneratedOffsetNotOnMappedBoundaries(
      code,
      'script_0',
      'this.handleClick',
    );
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

    const script = getScriptText(code);

    expect(script).toContain("const suffix = '!'");
    expect(script).toContain("this.message = 'hello' + suffix");
    expect(script).toContain('this.count = 1');
    expect(script).toContain('this.message = this.message + this.count');
    expect(script.indexOf("const suffix = '!'")).toBeLessThan(
      script.indexOf('this.count = 1'),
    );
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

    const script = getScriptText(code);

    expect(script).toContain("this.message = 'hello'");
    expect(script).toContain('this.count = 1');
    expect(script.indexOf("this.message = 'hello'")).toBeLessThan(
      script.indexOf('this.count = 1'),
    );
  });

  it('supports Riot v3 open syntax without script blocks', () => {
    const code = createVirtualCode(`
<demo-widget>
  <p>{ message }</p>
  this.message = 'hello'
</demo-widget>
`);

    const script = getScriptText(code);

    expect(script).toContain("this.message = 'hello'");
  });

  it('does not include HTML comments in Riot v3 open syntax', () => {
    // Arrange
    const code = createVirtualCode(`
<demo-widget>
  <p>{ message }</p>
  <!-- this.hidden = true -->
  <script>
    this.message = 'hello'
  </script>
</demo-widget>
`);

    // Act
    const script = getScriptText(code);

    // Assert
    expect(script).toContain("this.message = 'hello'");
    expect(script).not.toContain('this.hidden');
  });

  it('excludes HTML comments from script embedded code', () => {
    // Arrange
    const code = createVirtualCode(`
<demo-widget>
  <script>
    <!--
      this.hidden = true
    -->
    this.visible = true
    const marker = '<!-- keep -->'
  </script>
</demo-widget>
`);

    // Act
    const script = getScriptText(code);

    // Assert
    expect(script).toContain('this.visible = true');
    expect(script).toContain("const marker = '<!-- keep -->'");
    expect(script).not.toContain('this.hidden');
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

    const script = getScriptText(code);

    expect(script).toContain('this.increment = function() {');
    expect(script).toContain('if (this.count < 10) this.count++');
  });
});
