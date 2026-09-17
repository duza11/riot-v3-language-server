import { describe, expect, it } from 'vitest';
import { inferAssignedPropertyTypeIfAssigned } from '../../src/core/script/typeInference';
import { getTemplateIdentifierType } from '../helpers/typescript';
import { createVirtualCode } from '../helpers/virtualCode';

describe('assigned expression types', () => {
  it.each([
    'Object.keys(self.obj).reduce((obj, key) => { obj[key] = false; return obj; }, {})',
    'items.map(item => item.name)',
    'items.map(\nitem => item.name)',
    'Promise.resolve(1).then(value => value)',
    'getObject(), callback = () => 1',
    'getObject(); const callback = () => 1',
    'async()',
    '((value) => value)(1)',
    '(function () { return {}; })()',
  ])('does not treat the result of %s as a function', (expression) => {
    const source = `self.obj = ${expression}`;

    const type = inferAssignedPropertyTypeIfAssigned(source, 8, undefined);

    expect(type?.typeName).toBe('any');
  });

  it.each([
    'value => value',
    '(value) => value',
    '(value = fallback(() => 1)) => value',
    '(\nvalue\n) => value',
    'async value => value',
    'async (value) => value',
    'function (value) { return value; }',
    'async function (value) { return value; }',
    '((value) => value)',
  ])('preserves the function type of %s', (expression) => {
    const source = `self.obj = ${expression}`;

    const type = inferAssignedPropertyTypeIfAssigned(source, 8, undefined);

    expect(type?.typeName).toBe('(...args: any[]) => any');
  });

  it('preserves template property types after a reduce assignment', () => {
    const code = createVirtualCode(`
<test>
  <p>{ obj.hoge }</p>
  <script>
    const self = this;
    self.obj = { hoge: true };
    updateObject() {
      self.obj = Object.keys(self.obj).reduce((obj, key) => {
        obj[key] = false;
        return obj;
      }, {});
    }
  </script>
</test>`);

    const type = getTemplateIdentifierType(code, 'obj.hoge', 'hoge');

    expect(type).toBe('boolean');
  });
});
