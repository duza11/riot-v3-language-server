import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  getScriptJSDocTypedefs,
  parseJSDocFunctionTypes,
  parseJSDocType,
} from '../../src/core/script/jsdoc';
import { getTemplateIdentifierType } from '../helpers/typescript';
import { createVirtualCode, getGlobalTypesText } from '../helpers/virtualCode';

describe('nested JSDoc types', () => {
  it.each([
    '{[K: string]: object}',
    '{value: {count: number}}',
    'Array<{value: number}>',
    'string | {value: number}',
    '{value: number} & {label: string}',
    '{value: "}" | "{"}',
  ])('preserves %s in every typed tag', (type) => {
    const comment = `/**
     * @type {${type}}
     * @param {${type}} value
     * @returns {${type}}
     */`;

    const functionTypes = parseJSDocFunctionTypes(comment);
    const propertyType = parseJSDocType(comment);

    expect(functionTypes.params.get('value')).toBe(type);
    expect(functionTypes.returnType).toBe(type);
    expect(propertyType).toBe(type);
  });

  it('supports the singular return tag', () => {
    const comment = '/** @return {{value: number}} */';

    const result = parseJSDocFunctionTypes(comment);

    expect(result.returnType).toBe('{value: number}');
  });

  it('preserves optional parameter names with defaults', () => {
    const comment = '/** @param {{value: number}} [options={value: 0}] */';

    const result = parseJSDocFunctionTypes(comment);

    expect(result.params.get('options')).toBe('{value: number}');
  });

  it.each([
    [
      '/** @typedef {{value: {count: number}}} Item */',
      '{value: {count: number}}',
    ],
    [
      '/** @typedef {Object} Item\n * @property {{count: number}} value */',
      '{ value: {count: number}; }',
    ],
  ])('preserves nested typedef types in %s', (comment, expected) => {
    const snapshot = ts.ScriptSnapshot.fromString(comment);

    const types = getScriptJSDocTypedefs(snapshot, [
      { start: 0, end: comment.length, languageId: 'javascript' },
    ]);

    expect(types).toEqual([{ name: 'Item', typeName: expected }]);
  });

  it('removes comment line prefixes from multiline types', () => {
    const comment = '/** @returns {{\n * value: {count: number}\n * }} */';

    const result = parseJSDocFunctionTypes(comment);

    expect(result.returnType).toBe('{\nvalue: {count: number}\n}');
  });

  it('does not emit a truncated unclosed return type', () => {
    const comment = '/** @returns {{value: number} */';

    const result = parseJSDocFunctionTypes(comment);

    expect(result.returnType).toBeUndefined();
  });

  it.each(['', 'self.method();'])(
    'keeps shared declarations valid with reference %j',
    (reference) => {
      const code = createVirtualCode(`<test><script>
      const self = this;
      /** @return {{value: number}} */
      method() { return {value: 1}; }
      ${reference}
      self.hoge = 'text';
    </script></test>`);
      const source = ts.createSourceFile(
        'globals.ts',
        getGlobalTypesText(code),
        ts.ScriptTarget.Latest,
      );
      const host = ts.createCompilerHost({ noLib: true });
      host.getSourceFile = (name) =>
        name === 'globals.ts' ? source : undefined;

      const diagnostics = ts
        .createProgram(['globals.ts'], { noLib: true }, host)
        .getSyntacticDiagnostics();

      expect(diagnostics.map((diagnostic) => diagnostic.messageText)).toEqual(
        [],
      );
    },
  );

  it('does not include later component properties in a method return type', () => {
    const code = createVirtualCode(`<test>
      <p>{ method().value }</p>
      <script>
        const self = this;
        /** @return {{value: number}} */
        method() { return {value: 1}; }
        self.method();
        self.hoge = 'text';
      </script>
    </test>`);

    const type = getTemplateIdentifierType(code, 'this.method', 'method');

    expect(type).toBe('() => { value: number; }');
  });
});
