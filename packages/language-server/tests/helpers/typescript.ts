import * as ts from 'typescript';
import type { RiotV3VirtualCode } from '../../src/languagePlugin';
import { getEmbeddedCode, getEmbeddedText } from './virtualCode';

export function getTemplateIdentifierType(
  code: RiotV3VirtualCode,
  marker: string,
  identifier: string,
  projectFiles: Record<string, string> = {},
): string {
  return getEmbeddedIdentifierType(
    code,
    'template',
    '/virtual/riot-template.ts',
    ts.ScriptKind.TS,
    marker,
    identifier,
    projectFiles,
  );
}

export function getScriptIdentifierType(
  code: RiotV3VirtualCode,
  marker: string,
  identifier: string,
  projectFiles: Record<string, string> = {},
): string {
  return getEmbeddedIdentifierType(
    code,
    'script_0',
    '/virtual/riot-script.js',
    ts.ScriptKind.JS,
    marker,
    identifier,
    projectFiles,
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

export function getTemplateSourceQuickInfo(
  code: RiotV3VirtualCode,
  sourceOffset: number,
): string | undefined {
  const embedded = getEmbeddedCode(code, 'template');
  for (const mapping of embedded.mappings) {
    for (let index = 0; index < mapping.sourceOffsets.length; index++) {
      const mappedSourceOffset = mapping.sourceOffsets[index];
      const length = mapping.lengths[index];
      if (
        sourceOffset < mappedSourceOffset ||
        sourceOffset >= mappedSourceOffset + length
      ) {
        continue;
      }
      const generatedOffset =
        mapping.generatedOffsets[index] + sourceOffset - mappedSourceOffset;
      return getEmbeddedQuickInfoAtOffset(
        code,
        'template',
        '/virtual/riot-template.ts',
        generatedOffset,
      );
    }
  }
}

function getEmbeddedIdentifierType(
  code: RiotV3VirtualCode,
  embeddedCodeId: string,
  fileName: string,
  scriptKind: ts.ScriptKind,
  marker: string,
  identifier: string,
  projectFiles: Record<string, string>,
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
    ...Object.entries(projectFiles).map(([projectFileName, content]) =>
      ts.createSourceFile(
        projectFileName,
        content,
        ts.ScriptTarget.Latest,
        true,
      ),
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
  const quickInfo = getEmbeddedQuickInfoAtOffset(
    code,
    embeddedCodeId,
    fileName,
    identifierOffset,
  );
  if (!quickInfo) {
    throw new Error(`Quick info for "${identifier}" was not found.`);
  }
  return quickInfo;
}

function getEmbeddedQuickInfoAtOffset(
  code: RiotV3VirtualCode,
  embeddedCodeId: string,
  fileName: string,
  identifierOffset: number,
): string | undefined {
  const text = getEmbeddedText(code, embeddedCodeId);
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
  return quickInfo
    ? ts.displayPartsToString(quickInfo.displayParts)
    : undefined;
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
  return getTemplateSemanticDiagnostics(codes).filter(
    (diagnostic) => diagnostic.code === 2339,
  );
}

export function getTemplateSemanticDiagnostics(
  codes: RiotV3VirtualCode[],
  compilerOptions: ts.CompilerOptions = {},
): readonly ts.Diagnostic[] {
  const sourceFiles = createTemplateSourceFiles(codes);
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
    ...compilerOptions,
  };
  const program = createVirtualProgram(sourceFiles, options);

  return sourceFiles.flatMap((sourceFile) =>
    program.getSemanticDiagnostics(sourceFile),
  );
}

export function getTemplateSourceSemanticDiagnostics(
  code: RiotV3VirtualCode,
  compilerOptions: ts.CompilerOptions = {},
): Array<{ diagnostic: ts.Diagnostic; sourceOffset: number | undefined }> {
  const embedded = getEmbeddedCode(code, 'template');
  return getTemplateSemanticDiagnostics([code], compilerOptions).map(
    (diagnostic) => ({
      diagnostic,
      sourceOffset:
        diagnostic.start === undefined
          ? undefined
          : getMappedSourceOffset(embedded.mappings, diagnostic.start),
    }),
  );
}

function getMappedSourceOffset(
  mappings: RiotV3VirtualCode['embeddedCodes'][number]['mappings'],
  generatedOffset: number,
): number | undefined {
  for (const mapping of mappings) {
    for (let index = 0; index < mapping.generatedOffsets.length; index++) {
      const mappedGeneratedOffset = mapping.generatedOffsets[index];
      const length = mapping.lengths[index];
      if (
        generatedOffset >= mappedGeneratedOffset &&
        generatedOffset < mappedGeneratedOffset + length
      ) {
        return (
          mapping.sourceOffsets[index] + generatedOffset - mappedGeneratedOffset
        );
      }
    }
  }
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
