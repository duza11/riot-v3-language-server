import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { URI } from 'vscode-uri';
import { RiotV3VirtualCode, riotV3LanguagePlugin } from '../src/languagePlugin';
import { createVirtualCode } from './helpers/virtualCode';

describe('riotV3LanguagePlugin', () => {
  it('detects Riot v3 tag files', () => {
    const uri = URI.file('/workspace/demo.tag');

    const languageId = riotV3LanguagePlugin.getLanguageId?.(uri);

    expect(languageId).toBe('riot_v3');
  });

  it('ignores non-tag files', () => {
    const uri = URI.file('/workspace/demo.html');

    const languageId = riotV3LanguagePlugin.getLanguageId?.(uri);

    expect(languageId).toBeUndefined();
  });

  it('creates Riot v3 virtual code for Riot v3 documents', () => {
    const snapshot = ts.ScriptSnapshot.fromString('<demo-widget />');

    const code = riotV3LanguagePlugin.createVirtualCode?.(
      URI.file('/workspace/demo.tag'),
      'riot_v3',
      snapshot,
    );

    expect(code).toBeInstanceOf(RiotV3VirtualCode);
  });

  it('does not create virtual code for other language ids', () => {
    const snapshot = ts.ScriptSnapshot.fromString('<div />');

    const code = riotV3LanguagePlugin.createVirtualCode?.(
      URI.file('/workspace/demo.html'),
      'html',
      snapshot,
    );

    expect(code).toBeUndefined();
  });

  it('registers service scripts for generated Riot v3 embedded code', () => {
    const code = createVirtualCode(`
<demo-widget>
  <p>{ message }</p>
  <script>
    this.message = 'hello'
  </script>
</demo-widget>
`);

    const serviceScripts =
      riotV3LanguagePlugin.typescript?.getExtraServiceScripts?.(
        '/workspace/demo.tag',
        code,
      );

    expect(serviceScripts?.map((script) => script.fileName)).toEqual([
      '/workspace/demo.tag.script_0.js',
      '/workspace/demo.tag.template.ts',
      '/workspace/demo.tag.riot_v3_globals.d.ts',
    ]);
  });
});
