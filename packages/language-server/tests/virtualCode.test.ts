import { describe, expect, it } from 'vitest';
import {
  createVirtualCode,
  getEmbeddedCode,
  getEmbeddedText,
  getScriptText,
  getTemplateText,
} from './helpers/virtualCode';

describe('RiotV3VirtualCode embedded codes', () => {
  it('creates script, template, style, and global embedded codes', () => {
    const code = createVirtualCode(`
<demo-widget>
  <style>
    p { color: red; }
  </style>
  <p>{ message }</p>
  <script>
    this.message = 'hello'
  </script>
</demo-widget>
`);

    const ids = code.embeddedCodes.map((embedded) => embedded.id);

    expect(ids).toEqual(['style_0', 'script_0', 'template', 'riot_v3_globals']);
  });

  it('uses component-specific script contexts for multiple Riot v3 components', () => {
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

    const firstScript = getScriptText(code, 'script_0');
    const secondScript = getScriptText(code, 'script_1');

    expect(firstScript).toMatch(
      /@this \{import\('riot-v3:[^']+'\)\.TagInstance_0\}/,
    );
    expect(secondScript).toMatch(
      /@this \{import\('riot-v3:[^']+'\)\.TagInstance_1\}/,
    );
  });

  it('uses component-specific template contexts for multiple Riot v3 components', () => {
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

    const firstTemplate = getTemplateText(code, 'template_0');
    const secondTemplate = getTemplateText(code, 'template_1');

    expect(firstTemplate).toMatch(
      /this: import\('riot-v3:[^']+'\)\.TemplateInstance_0/,
    );
    expect(secondTemplate).toMatch(
      /this: import\('riot-v3:[^']+'\)\.TemplateInstance_1/,
    );
  });

  it('keeps style source text in style embedded code', () => {
    const code = createVirtualCode(`
<demo-widget>
  <style>
    p { color: red; }
  </style>
</demo-widget>
`);

    const style = getEmbeddedText(code, 'style_0');

    expect(style).toContain('p { color: red; }');
  });

  it('keeps global type property mappings out of semantic features', () => {
    const code = createVirtualCode(`
<demo-widget>
  <p>{ message }</p>
  <script>
    this.message = 'hello'
  </script>
</demo-widget>
`);

    const globals = getEmbeddedCode(code, 'riot_v3_globals');

    expect(globals.mappings).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          navigation: true,
          semantic: false,
        }),
      }),
    ]);
  });
});
