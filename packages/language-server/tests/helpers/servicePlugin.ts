import { createLanguage, forEachEmbeddedCode } from '@volar/language-core';
import {
  type LanguageServiceContext,
  TextDocument,
} from '@volar/language-server/node';
import * as ts from 'typescript';
import { URI } from 'vscode-uri';
import { riotV3LanguagePlugin } from '../../src/languagePlugin';

export function createServicePluginFixture(source: string) {
  const sourceUri = URI.file('/test.tag');
  const snapshot = ts.ScriptSnapshot.fromString(source);
  const language = createLanguage(
    [riotV3LanguagePlugin],
    new Map(),
    () => undefined,
  );
  const sourceScript = language.scripts.set(sourceUri, snapshot, 'riot_v3');
  if (!sourceScript?.generated) {
    throw new Error('Riot virtual code was not generated.');
  }
  const embeddedUris = new Map(
    [...forEachEmbeddedCode(sourceScript.generated.root)].map((code) => [
      code.id,
      URI.parse(`test-embedded:/${code.id}`),
    ]),
  );
  const documents = new Map<string, TextDocument>();
  const getDocument = (
    uri: URI,
    languageId: string,
    documentSnapshot: ts.IScriptSnapshot,
  ) => {
    const key = uri.toString();
    let document = documents.get(key);
    if (!document) {
      document = TextDocument.create(
        key,
        languageId,
        0,
        documentSnapshot.getText(0, documentSnapshot.getLength()),
      );
      documents.set(key, document);
    }
    return document;
  };
  const context = {
    language,
    documents: { get: getDocument },
    decodeEmbeddedDocumentUri(uri: URI) {
      const entry = [...embeddedUris].find(
        ([, embeddedUri]) => embeddedUri.toString() === uri.toString(),
      );
      return entry ? ([sourceUri, entry[0]] as const) : undefined;
    },
    encodeEmbeddedDocumentUri(_uri: URI, embeddedCodeId: string) {
      const uri = embeddedUris.get(embeddedCodeId);
      if (!uri) {
        throw new Error(`Embedded code "${embeddedCodeId}" was not found.`);
      }
      return uri;
    },
  } as LanguageServiceContext;

  return {
    context,
    getDocument(embeddedCodeId: string) {
      const code = sourceScript.generated?.embeddedCodes.get(embeddedCodeId);
      const uri = embeddedUris.get(embeddedCodeId);
      if (!code || !uri) {
        throw new Error(`Embedded code "${embeddedCodeId}" was not found.`);
      }
      return getDocument(uri, code.languageId, code.snapshot);
    },
  };
}
