import {
  createConnection,
  createServer,
  createTypeScriptProject,
  type Diagnostic,
  loadTsdkByPath,
} from '@volar/language-server/node';
import { create as createCssService } from 'volar-service-css';
import { create as createEmmetService } from 'volar-service-emmet';
import { create as createHtmlService } from 'volar-service-html';
import { create as createTypeScriptServices } from 'volar-service-typescript';
import { URI } from 'vscode-uri';
import {
  getRiotV3ReferenceRanges,
  getRiotV3RenameEdits,
  getRiotV3RenameRange,
  RiotV3VirtualCode,
  riotV3LanguagePlugin,
} from './languagePlugin';
import { resolveTsdkPath } from './tsdk';

const connection = createConnection();
const server = createServer(connection);

connection.listen();

connection.onInitialize((params) => {
  const tsdk = loadTsdkByPath(
    resolveTsdkPath(params.initializationOptions),
    params.locale,
  );
  return server.initialize(
    params,
    createTypeScriptProject(tsdk.typescript, tsdk.diagnosticMessages, () => ({
      languagePlugins: [riotV3LanguagePlugin],
    })),
    [
      createHtmlService(),
      createCssService(),
      createEmmetService(),
      ...createTypeScriptServices(tsdk.typescript),
      {
        capabilities: {
          diagnosticProvider: {
            interFileDependencies: false,
            workspaceDiagnostics: false,
          },
          renameProvider: {
            prepareProvider: true,
          },
          definitionProvider: true,
          documentHighlightProvider: true,
          referencesProvider: true,
        },
        create(context) {
          return {
            provideDefinition(document, position) {
              const uri = URI.parse(document.uri);
              const decoded = context.decodeEmbeddedDocumentUri(uri);
              const sourceScript = decoded
                ? context.language.scripts.get(decoded[0])
                : context.language.scripts.get(uri);
              if (!sourceScript || !sourceScript.id.path.endsWith('.tag')) {
                return;
              }
              let sourceOffset = document.offsetAt(position);
              if (decoded) {
                const virtualCode = sourceScript.generated?.embeddedCodes.get(
                  decoded[1],
                );
                if (!virtualCode) {
                  return;
                }
                const map = context.language.maps.get(
                  virtualCode,
                  sourceScript,
                );
                const mapped = map.toSourceLocation(sourceOffset).next();
                if (mapped.done) {
                  return;
                }
                sourceOffset = mapped.value[0];
              }
              const sourceDocument = context.documents.get(
                sourceScript.id,
                sourceScript.languageId,
                sourceScript.snapshot,
              );
              const definition = getRiotV3ReferenceRanges(
                sourceDocument.getText(),
                sourceOffset,
              )[0];
              if (!definition) {
                return;
              }
              const range = {
                start: sourceDocument.positionAt(definition.start),
                end: sourceDocument.positionAt(definition.end),
              };
              return [
                {
                  targetUri: sourceDocument.uri,
                  targetRange: range,
                  targetSelectionRange: range,
                },
              ];
            },
            provideDocumentHighlights(document, position) {
              const uri = URI.parse(document.uri);
              const decoded = context.decodeEmbeddedDocumentUri(uri);
              const sourceScript = decoded
                ? context.language.scripts.get(decoded[0])
                : context.language.scripts.get(uri);
              if (!sourceScript || !sourceScript.id.path.endsWith('.tag')) {
                return;
              }
              let sourceOffset = document.offsetAt(position);
              if (decoded) {
                const virtualCode = sourceScript.generated?.embeddedCodes.get(
                  decoded[1],
                );
                if (!virtualCode) {
                  return;
                }
                const map = context.language.maps.get(
                  virtualCode,
                  sourceScript,
                );
                const mapped = map.toSourceLocation(sourceOffset).next();
                if (mapped.done) {
                  return;
                }
                sourceOffset = mapped.value[0];
              }
              const sourceDocument = context.documents.get(
                sourceScript.id,
                sourceScript.languageId,
                sourceScript.snapshot,
              );
              return getRiotV3ReferenceRanges(
                sourceDocument.getText(),
                sourceOffset,
              ).map((reference) => ({
                range: {
                  start: sourceDocument.positionAt(reference.start),
                  end: sourceDocument.positionAt(reference.end),
                },
              }));
            },
            provideRenameRange(document, position) {
              const uri = URI.parse(document.uri);
              const decoded = context.decodeEmbeddedDocumentUri(uri);
              const sourceScript = decoded
                ? context.language.scripts.get(decoded[0])
                : context.language.scripts.get(uri);
              if (!sourceScript || !sourceScript.id.path.endsWith('.tag')) {
                return;
              }
              let sourceOffset = document.offsetAt(position);
              if (decoded) {
                const virtualCode = sourceScript.generated?.embeddedCodes.get(
                  decoded[1],
                );
                if (!virtualCode) {
                  return;
                }
                const map = context.language.maps.get(
                  virtualCode,
                  sourceScript,
                );
                const mapped = map.toSourceLocation(sourceOffset).next();
                if (mapped.done) {
                  return;
                }
                sourceOffset = mapped.value[0];
              }
              const sourceDocument = context.documents.get(
                sourceScript.id,
                sourceScript.languageId,
                sourceScript.snapshot,
              );
              const range = getRiotV3RenameRange(
                sourceDocument.getText(),
                sourceOffset,
              );
              if (!range) {
                return;
              }
              return {
                start: sourceDocument.positionAt(range.start),
                end: sourceDocument.positionAt(range.end),
              };
            },
            provideReferences(document, position, referenceContext, _token) {
              const uri = URI.parse(document.uri);
              const decoded = context.decodeEmbeddedDocumentUri(uri);
              const sourceScript = decoded
                ? context.language.scripts.get(decoded[0])
                : context.language.scripts.get(uri);
              if (!sourceScript || !sourceScript.id.path.endsWith('.tag')) {
                return;
              }
              let sourceOffset = document.offsetAt(position);
              if (decoded) {
                const virtualCode = sourceScript.generated?.embeddedCodes.get(
                  decoded[1],
                );
                if (!virtualCode) {
                  return;
                }
                const map = context.language.maps.get(
                  virtualCode,
                  sourceScript,
                );
                const mapped = map.toSourceLocation(sourceOffset).next();
                if (mapped.done) {
                  return;
                }
                sourceOffset = mapped.value[0];
              }
              const sourceDocument = context.documents.get(
                sourceScript.id,
                sourceScript.languageId,
                sourceScript.snapshot,
              );
              const references = getRiotV3ReferenceRanges(
                sourceDocument.getText(),
                sourceOffset,
              );
              const filteredReferences = referenceContext.includeDeclaration
                ? references
                : references.slice(1);
              return filteredReferences.map((reference) => ({
                uri: sourceDocument.uri,
                range: {
                  start: sourceDocument.positionAt(reference.start),
                  end: sourceDocument.positionAt(reference.end),
                },
              }));
            },
            provideRenameEdits(document, position, newName) {
              const uri = URI.parse(document.uri);
              const decoded = context.decodeEmbeddedDocumentUri(uri);
              const sourceScript = decoded
                ? context.language.scripts.get(decoded[0])
                : context.language.scripts.get(uri);
              if (!sourceScript || !sourceScript.id.path.endsWith('.tag')) {
                return;
              }
              let sourceOffset = document.offsetAt(position);
              if (decoded) {
                const virtualCode = sourceScript.generated?.embeddedCodes.get(
                  decoded[1],
                );
                if (!virtualCode) {
                  return;
                }
                const map = context.language.maps.get(
                  virtualCode,
                  sourceScript,
                );
                const mapped = map.toSourceLocation(sourceOffset).next();
                if (mapped.done) {
                  return;
                }
                sourceOffset = mapped.value[0];
              }
              const sourceDocument = context.documents.get(
                sourceScript.id,
                sourceScript.languageId,
                sourceScript.snapshot,
              );
              const edits = getRiotV3RenameEdits(
                sourceDocument.getText(),
                sourceOffset,
                newName,
              );
              if (!edits.length) {
                return;
              }
              return {
                changes: {
                  [sourceDocument.uri]: edits.map((edit) => ({
                    range: {
                      start: sourceDocument.positionAt(edit.start),
                      end: sourceDocument.positionAt(edit.end),
                    },
                    newText: edit.newText,
                  })),
                },
              };
            },
            provideDiagnostics(document) {
              const decoded = context.decodeEmbeddedDocumentUri(
                URI.parse(document.uri),
              );
              if (!decoded) {
                // Not an embedded document
                return;
              }
              const virtualCode = context.language.scripts
                .get(decoded[0])
                ?.generated?.embeddedCodes.get(decoded[1]);
              if (!(virtualCode instanceof RiotV3VirtualCode)) {
                return;
              }
              const styleNodes = virtualCode.styleNodes;
              if (styleNodes.length <= 1) {
                return;
              }
              const errors: Diagnostic[] = [];
              for (let i = 1; i < styleNodes.length; i++) {
                errors.push({
                  severity: 2,
                  range: {
                    start: document.positionAt(styleNodes[i].start),
                    end: document.positionAt(styleNodes[i].end),
                  },
                  source: 'riot_v3',
                  message: 'Only one style tag is allowed.',
                });
              }
              return errors;
            },
          };
        },
      },
    ],
  );
});

connection.onInitialized(server.initialized);

connection.onShutdown(server.shutdown);
