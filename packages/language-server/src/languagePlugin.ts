import { forEachEmbeddedCode, type LanguagePlugin } from '@volar/language-core';
import type { TypeScriptExtraServiceScript } from '@volar/typescript';
import type * as ts from 'typescript';
import type { URI } from 'vscode-uri';
import { RiotV3VirtualCode } from './core/virtualCode';

export type {
  RiotV3ReferenceRange,
  RiotV3RenameRange,
  RiotV3RenameTextEdit,
} from './core/types';

const scriptKind = {
  JS: 1,
  JSX: 2,
  TS: 3,
  TSX: 4,
  Deferred: 7,
} as const;

export const riotV3LanguagePlugin: LanguagePlugin<URI> = {
  getLanguageId(uri) {
    if (uri.path.endsWith('.tag')) {
      return 'riot_v3';
    }
  },
  createVirtualCode(uri, languageId, snapshot) {
    if (languageId === 'riot_v3') {
      return new RiotV3VirtualCode(snapshot, uri.path);
    }
  },
  typescript: {
    extraFileExtensions: [
      {
        extension: 'tag',
        isMixedContent: true,
        scriptKind: scriptKind.Deferred satisfies ts.ScriptKind.Deferred,
      },
    ],
    getServiceScript() {
      return undefined;
    },
    getExtraServiceScripts(fileName, root) {
      const scripts: TypeScriptExtraServiceScript[] = [];
      for (const code of forEachEmbeddedCode(root)) {
        if (code.id === 'riot_v3_globals') {
          scripts.push({
            fileName: fileName + '.' + code.id + '.d.ts',
            code,
            extension: '.d.ts',
            scriptKind: scriptKind.TS satisfies ts.ScriptKind.TS,
          });
        } else if (
          code.languageId === 'javascript' ||
          code.languageId === 'javascriptreact'
        ) {
          scripts.push({
            fileName:
              fileName +
              '.' +
              code.id +
              (code.languageId === 'javascriptreact' ? '.jsx' : '.js'),
            code,
            extension: code.languageId === 'javascriptreact' ? '.jsx' : '.js',
            scriptKind:
              code.languageId === 'javascriptreact'
                ? (scriptKind.JSX satisfies ts.ScriptKind.JSX)
                : (scriptKind.JS satisfies ts.ScriptKind.JS),
          });
        } else if (
          code.languageId === 'typescript' ||
          code.languageId === 'typescriptreact'
        ) {
          scripts.push({
            fileName:
              fileName +
              '.' +
              code.id +
              (code.languageId === 'typescriptreact' ? '.tsx' : '.ts'),
            code,
            extension: code.languageId === 'typescriptreact' ? '.tsx' : '.ts',
            scriptKind:
              code.languageId === 'typescriptreact'
                ? (scriptKind.TSX satisfies ts.ScriptKind.TSX)
                : (scriptKind.TS satisfies ts.ScriptKind.TS),
          });
        }
      }
      return scripts;
    },
  },
};

export {
  getRiotV3ReferenceOccurrences,
  getRiotV3ReferenceRanges,
  getRiotV3RenameEdits,
  getRiotV3RenameRange,
} from './core/navigation';

export { RiotV3VirtualCode } from './core/virtualCode';
