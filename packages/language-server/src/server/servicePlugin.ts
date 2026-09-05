import {
  type Diagnostic,
  DiagnosticSeverity,
  DiagnosticTag,
  DocumentHighlightKind,
  type LanguageServicePlugin,
  type Position,
} from '@volar/language-server/node';
import {
  getUnusedRiotV3ComponentMembers,
  type UnusedRiotV3ComponentMember,
} from '../core/diagnostics';
import {
  getRiotV3ReferenceOccurrencesForAnalysis,
  getRiotV3RenameEditsForAnalysis,
  getRiotV3RenameRangeForAnalysis,
  type NavigationOccurrence,
} from '../core/navigation';
import {
  getRiotV3DocumentContext,
  getRiotV3RootDocumentContext,
} from './documentContext';

export function createRiotV3ServicePlugin(): LanguageServicePlugin {
  return {
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
          const resolved = getRiotV3DocumentContext(
            context,
            document,
            position,
          );
          if (!resolved) {
            return;
          }
          const occurrences = getRiotV3ReferenceOccurrencesForAnalysis(
            resolved.virtualCode.analysis,
            resolved.sourceOffset,
          );
          const definitions = occurrences.filter(
            (occurrence) =>
              occurrence.role === 'declaration' || occurrence.isDefinition,
          );
          const targets = definitions.length
            ? definitions
            : occurrences.slice(0, 1);
          if (!targets.length) {
            return;
          }
          return targets.map((definition) => {
            const range = {
              start: resolved.sourceDocument.positionAt(definition.start),
              end: resolved.sourceDocument.positionAt(definition.end),
            };
            return {
              targetUri: resolved.sourceDocument.uri,
              targetRange: range,
              targetSelectionRange: range,
            };
          });
        },
        provideDocumentHighlights(document, position) {
          const resolved = getRiotV3DocumentContext(
            context,
            document,
            position,
          );
          if (!resolved) {
            return;
          }
          return getRiotV3ReferenceOccurrencesForAnalysis(
            resolved.virtualCode.analysis,
            resolved.sourceOffset,
          ).map((occurrence) => ({
            range: {
              start: resolved.sourceDocument.positionAt(occurrence.start),
              end: resolved.sourceDocument.positionAt(occurrence.end),
            },
            kind:
              occurrence.role === 'read'
                ? DocumentHighlightKind.Read
                : DocumentHighlightKind.Write,
          }));
        },
        provideRenameRange(document, position) {
          const resolved = getRiotV3DocumentContext(
            context,
            document,
            position,
          );
          if (!resolved) {
            return;
          }
          const range = getRiotV3RenameRangeForAnalysis(
            resolved.virtualCode.analysis,
            resolved.sourceOffset,
          );
          return range
            ? {
                start: resolved.sourceDocument.positionAt(range.start),
                end: resolved.sourceDocument.positionAt(range.end),
              }
            : undefined;
        },
        provideReferences(document, position, referenceContext) {
          const resolved = getRiotV3DocumentContext(
            context,
            document,
            position,
          );
          if (!resolved) {
            return;
          }
          const occurrences = filterReferenceOccurrences(
            getRiotV3ReferenceOccurrencesForAnalysis(
              resolved.virtualCode.analysis,
              resolved.sourceOffset,
            ),
            referenceContext.includeDeclaration,
          );
          return occurrences.map((occurrence) => ({
            uri: resolved.sourceDocument.uri,
            range: {
              start: resolved.sourceDocument.positionAt(occurrence.start),
              end: resolved.sourceDocument.positionAt(occurrence.end),
            },
          }));
        },
        provideRenameEdits(document, position, newName) {
          const resolved = getRiotV3DocumentContext(
            context,
            document,
            position,
          );
          if (!resolved) {
            return;
          }
          const edits = getRiotV3RenameEditsForAnalysis(
            resolved.virtualCode.analysis,
            resolved.sourceOffset,
            newName,
          );
          if (!edits.length) {
            return;
          }
          return {
            changes: {
              [resolved.sourceDocument.uri]: edits.map((edit) => ({
                range: {
                  start: resolved.sourceDocument.positionAt(edit.start),
                  end: resolved.sourceDocument.positionAt(edit.end),
                },
                newText: edit.newText,
              })),
            },
          };
        },
        provideDiagnostics(document) {
          const resolved = getRiotV3RootDocumentContext(context, document);
          if (!resolved) {
            return;
          }
          const errors: Diagnostic[] = [];
          for (
            let index = 1;
            index < resolved.virtualCode.styleNodes.length;
            index++
          ) {
            const style = resolved.virtualCode.styleNodes[index];
            errors.push({
              severity: 2,
              range: {
                start: resolved.sourceDocument.positionAt(style.start),
                end: resolved.sourceDocument.positionAt(style.end),
              },
              source: 'riot_v3',
              message: 'Only one style tag is allowed.',
            });
          }
          errors.push(
            ...createUnusedComponentMemberDiagnostics(
              getUnusedRiotV3ComponentMembers(resolved.virtualCode.analysis),
              (offset) => resolved.sourceDocument.positionAt(offset),
            ),
          );
          return errors.length ? errors : undefined;
        },
      };
    },
  };
}

export function createUnusedComponentMemberDiagnostics(
  members: UnusedRiotV3ComponentMember[],
  positionAt: (offset: number) => Position,
): Diagnostic[] {
  return members.map((member) => ({
    severity: DiagnosticSeverity.Hint,
    range: {
      start: positionAt(member.start),
      end: positionAt(member.end),
    },
    code: 6133,
    source: 'riot_v3',
    tags: [DiagnosticTag.Unnecessary],
    message: `'${member.name}' is declared but its value is never read.`,
  }));
}

export function filterReferenceOccurrences(
  occurrences: NavigationOccurrence[],
  includeDeclaration: boolean,
): NavigationOccurrence[] {
  return includeDeclaration
    ? occurrences
    : occurrences.filter(
        (occurrence) => occurrence.role !== 'declaration',
      );
}
