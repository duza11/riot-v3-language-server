import { describe, expect, it } from 'vitest';
import { getTemplateIdentifierQuickInfo } from '../helpers/typescript';
import {
  createVirtualCode,
  expectTemplateIdentifierPrefixNotMapped,
  expectTemplateNavigationMappingsToBeDisabled,
  getTemplateText,
  offsetOf,
} from '../helpers/virtualCode';

describe('template virtual code', () => {
  it('shows short component state names in template quick info', () => {
    const code = createVirtualCode(
      `
  <demo-widget>
    <p>{ message }</p>
    <script>
      this.message = 'hello'
    </script>
  </demo-widget>
  `,
      '/workspace/demo.tag',
    );

    expect(
      getTemplateIdentifierQuickInfo(code, 'void (this.message)', 'message'),
    ).toBe('(property) ComponentState_0.message: string');
  });

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

  it('ignores template expressions inside HTML comments', () => {
    // Arrange
    const code = createVirtualCode(`
  <demo-widget>
    <div>
      <p>{ visible }</p>
      <!-- <p>{ hidden }</p> -->
    </div>
    <script>
      this.visible = true
    </script>
  </demo-widget>
  `);

    // Act
    const template = getTemplateText(code);

    // Assert
    expect(template).toContain('this.visible');
    expect(template).not.toContain('this.hidden');
  });

  it('ignores template expressions inside unclosed HTML comments', () => {
    // Arrange
    const code = createVirtualCode(`
  <demo-widget>
    <p>{ visible }</p>
    <!-- <p>{ hidden }</p>
  </demo-widget>
  `);

    // Act
    const template = getTemplateText(code);

    // Assert
    expect(template).toContain('this.visible');
    expect(template).not.toContain('this.hidden');
  });

  it('keeps template expressions inside quoted HTML comment markers', () => {
    // Arrange
    const code = createVirtualCode(`
  <demo-widget>
    <p title="<!-- { marker } -->">{ visible }</p>
    <script>
      this.marker = 'marker'
      this.visible = true
    </script>
  </demo-widget>
  `);

    // Act
    const template = getTemplateText(code);

    // Assert
    expect(template).toContain('this.marker');
    expect(template).toContain('this.visible');
  });

  it('ignores identifiers in JavaScript block comments inside template expressions', () => {
    // Arrange
    const code = createVirtualCode(`
  <demo-widget>
    <p>{ visible /* hidden */ }</p>
    <script>
      this.visible = true
      this.hidden = false
    </script>
  </demo-widget>
  `);

    // Act
    const template = getTemplateText(code);

    // Assert
    expect(template).toContain('this.visible');
    expect(template).not.toContain('this.hidden');
  });

  it('ignores identifiers in JavaScript line comments inside template expressions', () => {
    // Arrange
    const code = createVirtualCode(`
  <demo-widget>
    <p>{
      visible // hidden
    }</p>
    <script>
      this.visible = true
      this.hidden = false
    </script>
  </demo-widget>
  `);

    // Act
    const template = getTemplateText(code);

    // Assert
    expect(template).toContain('this.visible');
    expect(template).not.toContain('this.hidden');
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
