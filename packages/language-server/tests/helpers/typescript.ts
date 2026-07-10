import * as ts from 'typescript';
import type { RiotV3VirtualCode } from '../../src/languagePlugin';
import { getEmbeddedText } from './virtualCode';

export function getTemplateIdentifierType(
  code: RiotV3VirtualCode,
  marker: string,
  identifier: string,
): string {
  return getEmbeddedIdentifierType(
    code,
    'template',
    '/virtual/riot-template.ts',
    ts.ScriptKind.TS,
    marker,
    identifier,
  );
}

export function getScriptIdentifierType(
  code: RiotV3VirtualCode,
  marker: string,
  identifier: string,
): string {
  return getEmbeddedIdentifierType(
    code,
    'script_0',
    '/virtual/riot-script.js',
    ts.ScriptKind.JS,
    marker,
    identifier,
  );
}

function getEmbeddedIdentifierType(
  code: RiotV3VirtualCode,
  embeddedCodeId: string,
  fileName: string,
  scriptKind: ts.ScriptKind,
  marker: string,
  identifier: string,
): string {
  const text =
    getEmbeddedText(code, 'riot_v3_globals') +
    '\n' +
    getEmbeddedText(code, embeddedCodeId);
  const markerOffset = text.indexOf(marker);
  if (markerOffset === -1) {
    throw new Error(`Marker "${marker}" was not found.`);
  }
  const markerIdentifierOffset = marker.indexOf(identifier);
  if (markerIdentifierOffset === -1) {
    throw new Error(`Identifier "${identifier}" was not found.`);
  }
  const identifierOffset = markerOffset + markerIdentifierOffset;
  const options: ts.CompilerOptions = {
    allowJs: true,
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
      ? ts.createSourceFile(
          requestedFileName,
          text,
          languageVersion,
          true,
          scriptKind,
        )
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

export function getTemplatePropertyDoesNotExistDiagnostics(
  codes: RiotV3VirtualCode[],
): readonly ts.Diagnostic[] {
  const sourceFiles = createTemplateSourceFiles(codes);
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  const sourceFilesByName = new Map(
    sourceFiles.map((sourceFile) => [sourceFile.fileName, sourceFile]),
  );
  host.getSourceFile = (
    requestedFileName,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) =>
    sourceFilesByName.get(requestedFileName) ??
    getSourceFile(
      requestedFileName,
      languageVersion,
      onError,
      shouldCreateNewSourceFile,
    );
  const program = ts.createProgram(
    sourceFiles.map((sourceFile) => sourceFile.fileName),
    options,
    host,
  );

  return sourceFiles.flatMap((sourceFile) =>
    program
      .getSemanticDiagnostics(sourceFile)
      .filter((diagnostic) => diagnostic.code === 2339),
  );
}

function createTemplateSourceFiles(
  codes: RiotV3VirtualCode[],
): ts.SourceFile[] {
  if (!codes.length) {
    throw new Error('At least one virtual code is required.');
  }
  const globalTypes = codes.map((code) =>
    getEmbeddedText(code, 'riot_v3_globals'),
  );
  const dynamicTypesOffset = globalTypes[0].indexOf(
    '\ninterface RiotV3ComponentState_',
  );
  if (dynamicTypesOffset === -1) {
    throw new Error('Riot v3 component state types were not found.');
  }
  const sharedGlobalTypes = globalTypes[0].slice(0, dynamicTypesOffset);
  const combinedGlobalTypes =
    sharedGlobalTypes +
    globalTypes.map((types) => types.slice(dynamicTypesOffset)).join('');

  return [
    ts.createSourceFile(
      '/virtual/riot-v3-globals.d.ts',
      combinedGlobalTypes,
      ts.ScriptTarget.Latest,
      true,
    ),
    ...codes.map((code, index) =>
      ts.createSourceFile(
        `/virtual/riot-template-${index}.ts`,
        getEmbeddedText(code, 'template'),
        ts.ScriptTarget.Latest,
        true,
      ),
    ),
  ];
}
