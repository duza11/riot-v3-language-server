import { describe, expect, it } from 'vitest';
import { createVirtualCode, getTemplateText } from '../helpers/virtualCode';

describe('class shorthand template expressions', () => {
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

    expect(template).toContain(
      "function(this: import('riot-v3:anonymous').EachTemplateContext_0)",
    );
    expect(template).toContain('item.active');
    expect(template).toContain('item.name');
    expect(template).toContain('this.selected');
    expect(template).not.toMatch(/\bthis\.item\b/);
    expect(template).not.toMatch(/\bthis\.active\b/);
  });
});
