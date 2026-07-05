import * as ts from 'typescript';
import { expect } from 'vitest';
import { RiotV3VirtualCode } from '../../src/languagePlugin';

export function createVirtualCode(source: string): RiotV3VirtualCode {
  return new RiotV3VirtualCode(ts.ScriptSnapshot.fromString(source));
}

export function getEmbeddedCode(
  code: RiotV3VirtualCode,
  id: string,
): RiotV3VirtualCode['embeddedCodes'][number] {
  const embedded = code.embeddedCodes.find((code) => code.id === id);
  if (!embedded) {
    throw new Error(`Embedded code "${id}" was not found.`);
  }
  return embedded;
}

export function getEmbeddedText(code: RiotV3VirtualCode, id: string): string {
  const embedded = getEmbeddedCode(code, id);
  return embedded.snapshot.getText(0, embedded.snapshot.getLength());
}

export function getGlobalTypesText(code: RiotV3VirtualCode): string {
  return getEmbeddedText(code, 'riot_v3_globals');
}

export function getScriptText(
  code: RiotV3VirtualCode,
  id = 'script_0',
): string {
  return getEmbeddedText(code, id);
}

export function getTemplateText(
  code: RiotV3VirtualCode,
  id = 'template',
): string {
  return getEmbeddedText(code, id);
}

export function getInterfaceBody(text: string, name: string): string {
  const match = text.match(
    new RegExp(`interface ${name}[^}]*{([\\s\\S]*?)\\n}`),
  );
  if (!match) {
    throw new Error(`Interface "${name}" was not found.`);
  }
  return match[1];
}

export function offsetOf(
  source: string,
  marker: string,
  target = marker,
): number {
  const markerOffset = source.indexOf(marker);
  if (markerOffset === -1) {
    throw new Error(`Marker "${marker}" was not found.`);
  }
  const targetOffset = marker.indexOf(target);
  if (targetOffset === -1) {
    throw new Error(`Target "${target}" was not found in "${marker}".`);
  }
  return markerOffset + targetOffset;
}

export function lastOffsetOf(
  source: string,
  marker: string,
  target = marker,
): number {
  const markerOffset = source.lastIndexOf(marker);
  if (markerOffset === -1) {
    throw new Error(`Marker "${marker}" was not found.`);
  }
  const targetOffset = marker.indexOf(target);
  if (targetOffset === -1) {
    throw new Error(`Target "${target}" was not found in "${marker}".`);
  }
  return markerOffset + targetOffset;
}

export function textAtRanges(
  source: string,
  ranges: { start: number; end: number }[],
): string[] {
  return ranges.map((range) => source.slice(range.start, range.end));
}

export function startsOf(ranges: { start: number }[]): number[] {
  return ranges.map((range) => range.start);
}

export function expectAllNewText(
  edits: { newText: string }[],
  expected: string,
): void {
  expect(new Set(edits.map((edit) => edit.newText))).toEqual(
    new Set([expected]),
  );
}

export function expectGeneratedOffsetNotOnMappedBoundaries(
  code: RiotV3VirtualCode,
  embeddedId: string,
  generatedText: string,
): void {
  const embedded = getEmbeddedCode(code, embeddedId);
  const text = embedded.snapshot.getText(0, embedded.snapshot.getLength());
  const generatedOffset = text.indexOf(generatedText);
  expect(generatedOffset).toBeGreaterThan(-1);
  const boundaries = embedded.mappings.flatMap((mapping) =>
    mapping.generatedOffsets.flatMap((offset, index) => [
      offset,
      offset + (mapping.generatedLengths?.[index] ?? mapping.lengths[index]),
    ]),
  );
  expect(boundaries).not.toContain(generatedOffset);
}

export function expectTemplateIdentifierPrefixNotMapped(
  code: RiotV3VirtualCode,
  sourceOffset: number,
  generatedLength: number,
): void {
  const template = getEmbeddedCode(code, 'template');
  const hasMappedGeneratedPrefix = template.mappings.some(
    (mapping) =>
      mapping.sourceOffsets.includes(sourceOffset) &&
      mapping.lengths.includes(0) &&
      mapping.generatedLengths?.includes(generatedLength),
  );
  expect(hasMappedGeneratedPrefix).toBe(false);
}

export function expectTemplateNavigationMappingsToBeDisabled(
  code: RiotV3VirtualCode,
): void {
  const template = getEmbeddedCode(code, 'template');
  const hasNavigableSourceMapping = template.mappings.some(
    (mapping) =>
      mapping.data.navigation === true &&
      mapping.lengths.some((length) => length > 0),
  );
  expect(hasNavigableSourceMapping).toBe(false);
}
