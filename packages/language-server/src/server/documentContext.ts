import type {
  LanguageServiceContext,
  Position,
  TextDocument,
} from '@volar/language-server/node';
import { URI } from 'vscode-uri';
import { RiotV3VirtualCode } from '../core/virtualCode';

export interface RiotV3DocumentContext {
  sourceDocument: TextDocument;
  sourceOffset: number;
  virtualCode: RiotV3VirtualCode;
}

export function getRiotV3DocumentContext(
  context: LanguageServiceContext,
  document: TextDocument,
  position: Position,
): RiotV3DocumentContext | undefined {
  const resolved = getRiotV3SourceDocument(context, document);
  if (!resolved) {
    return;
  }
  let sourceOffset = document.offsetAt(position);
  if (resolved.embeddedCode) {
    const map = context.language.maps.get(
      resolved.embeddedCode,
      resolved.sourceScript,
    );
    const mapped = map.toSourceLocation(sourceOffset).next();
    if (mapped.done) {
      return;
    }
    sourceOffset = mapped.value[0];
  }
  return {
    sourceDocument: resolved.sourceDocument,
    sourceOffset,
    virtualCode: resolved.virtualCode,
  };
}

export function getRiotV3RootDocumentContext(
  context: LanguageServiceContext,
  document: TextDocument,
):
  | Pick<RiotV3DocumentContext, 'sourceDocument' | 'virtualCode'>
  | undefined {
  const resolved = getRiotV3SourceDocument(context, document);
  return resolved
    ? {
        sourceDocument: resolved.sourceDocument,
        virtualCode: resolved.virtualCode,
      }
    : undefined;
}

function getRiotV3SourceDocument(
  context: LanguageServiceContext,
  document: TextDocument,
) {
  const uri = URI.parse(document.uri);
  const decoded = context.decodeEmbeddedDocumentUri(uri);
  const sourceScript = decoded
    ? context.language.scripts.get(decoded[0])
    : context.language.scripts.get(uri);
  if (
    !sourceScript ||
    !sourceScript.id.path.endsWith('.tag') ||
    !(sourceScript.generated?.root instanceof RiotV3VirtualCode)
  ) {
    return;
  }
  const embeddedCode = decoded
    ? sourceScript.generated.embeddedCodes.get(decoded[1])
    : undefined;
  if (decoded && !embeddedCode) {
    return;
  }
  return {
    sourceScript,
    embeddedCode,
    virtualCode: sourceScript.generated.root,
    sourceDocument: context.documents.get(
      sourceScript.id,
      sourceScript.languageId,
      sourceScript.snapshot,
    ),
  };
}
