import * as ts from 'typescript';
import type { RiotV3VirtualCode } from '../../src/languagePlugin';
import { getEmbeddedText } from './virtualCode';

export function getTemplateIdentifierType(
  code: RiotV3VirtualCode,
  marker: string,
  identifier: string,
): string {
  const text =
    getEmbeddedText(code, 'riot_v3_globals') +
    '\n' +
    getEmbeddedText(code, 'template');
  const markerOffset = text.indexOf(marker);
  if (markerOffset === -1) {
    throw new Error(`Marker "${marker}" was not found.`);
  }
  const markerIdentifierOffset = marker.indexOf(identifier);
  if (markerIdentifierOffset === -1) {
    throw new Error(`Identifier "${identifier}" was not found.`);
  }
  const identifierOffset = markerOffset + markerIdentifierOffset;
  const fileName = '/virtual/riot-template.ts';
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (
    requestedFileName,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) =>
    requestedFileName === fileName
      ? ts.createSourceFile(requestedFileName, text, languageVersion, true)
      : getSourceFile(
          requestedFileName,
          languageVersion,
          onError,
          shouldCreateNewSourceFile,
        );
  const program = ts.createProgram([fileName], options, host);
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) {
    throw new Error('Virtual TypeScript source was not created.');
  }
  let result: string | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isIdentifier(node) &&
      node.getStart(sourceFile) === identifierOffset
    ) {
      result = checker.typeToString(checker.getTypeAtLocation(node));
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!result) {
    throw new Error(`Type for "${identifier}" was not found.`);
  }
  return result;
}
