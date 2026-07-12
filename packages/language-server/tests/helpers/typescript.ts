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

export function getTemplateIdentifierQuickInfo(
  code: RiotV3VirtualCode,
  marker: string,
  identifier: string,
): string {
  return getEmbeddedIdentifierQuickInfo(
    code,
    'template',
    '/virtual/riot-template.ts',
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
  const text = getEmbeddedText(code, embeddedCodeId);
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
  const sourceFiles = [
    ts.createSourceFile(
      '/virtual/riot-v3-globals.d.ts',
      getEmbeddedText(code, 'riot_v3_globals'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    ),
    ts.createSourceFile(
      fileName,
      text,
      ts.ScriptTarget.Latest,
      true,
      scriptKind,
    ),
  ];
  const program = createVirtualProgram(sourceFiles, options);
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

function getEmbeddedIdentifierQuickInfo(
  code: RiotV3VirtualCode,
  embeddedCodeId: string,
  fileName: string,
  marker: string,
  identifier: string,
): string {
  const text = getEmbeddedText(code, embeddedCodeId);
  const identifierOffset = getIdentifierOffset(text, marker, identifier);
  const globalTypesFileName = '/virtual/riot-v3-globals.d.ts';
  const files = new Map([
    [globalTypesFileName, getEmbeddedText(code, 'riot_v3_globals')],
    [fileName, text],
  ]);
  const options: ts.CompilerOptions = {
    allowJs: true,
    strict: true,
    noEmit: true,
    lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
  };
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => options,
    getCurrentDirectory: () => '/virtual',
    getDefaultLibFileName: (compilerOptions) =>
      ts.getDefaultLibFilePath(compilerOptions),
    getScriptFileNames: () => [...files.keys()],
    getScriptSnapshot: (requestedFileName) => {
      const content = files.get(requestedFileName);
      if (content !== undefined) {
        return ts.ScriptSnapshot.fromString(content);
      }
      const diskContent = ts.sys.readFile(requestedFileName);
      return diskContent === undefined
        ? undefined
        : ts.ScriptSnapshot.fromString(diskContent);
    },
    getScriptVersion: () => '1',
    fileExists: (requestedFileName) =>
      files.has(requestedFileName) || ts.sys.fileExists(requestedFileName),
    readFile: (requestedFileName) =>
      files.get(requestedFileName) ?? ts.sys.readFile(requestedFileName),
    readDirectory: ts.sys.readDirectory,
  };
  const service = ts.createLanguageService(host);
  const quickInfo = service.getQuickInfoAtPosition(fileName, identifierOffset);
  if (!quickInfo) {
    throw new Error(`Quick info for "${identifier}" was not found.`);
  }
  return ts.displayPartsToString(quickInfo.displayParts);
}

function getIdentifierOffset(
  text: string,
  marker: string,
  identifier: string,
): number {
  const markerOffset = text.indexOf(marker);
  if (markerOffset === -1) {
    throw new Error(`Marker "${marker}" was not found.`);
  }
  const markerIdentifierOffset = marker.indexOf(identifier);
  if (markerIdentifierOffset === -1) {
    throw new Error(`Identifier "${identifier}" was not found.`);
  }
  return markerOffset + markerIdentifierOffset;
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
  const program = createVirtualProgram(sourceFiles, options);

  return sourceFiles.flatMap((sourceFile) =>
    program
      .getSemanticDiagnostics(sourceFile)
      .filter((diagnostic) => diagnostic.code === 2339),
  );
}

function createVirtualProgram(
  sourceFiles: ts.SourceFile[],
  options: ts.CompilerOptions,
): ts.Program {
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

  return ts.createProgram(
    sourceFiles.map((sourceFile) => sourceFile.fileName),
    options,
    host,
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
  const dynamicTypesOffset = getDynamicTypesOffset(globalTypes[0]);
  const sharedGlobalTypes = globalTypes[0].slice(0, dynamicTypesOffset);
  const combinedGlobalTypes =
    sharedGlobalTypes +
    globalTypes
      .map((types) => types.slice(getDynamicTypesOffset(types)))
      .join('');

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

function getDynamicTypesOffset(types: string): number {
  const offset = types.indexOf("\ndeclare module 'riot-v3:");
  if (offset === -1) {
    throw new Error('Riot v3 component types were not found.');
  }
  return offset;
}
