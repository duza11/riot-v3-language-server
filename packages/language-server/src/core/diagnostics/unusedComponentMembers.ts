import type {
  RiotV3ComponentAnalysis,
  RiotV3DocumentAnalysis,
} from '../analysis';
import { getRiotPropertyOccurrences } from '../navigation';
import { scanRiotV3Methods } from '../script';
import type { ScriptProperty } from '../types';

export interface UnusedRiotV3ComponentMember {
  name: string;
  start: number;
  end: number;
}

export function getUnusedRiotV3ComponentMembers(
  analysis: RiotV3DocumentAnalysis,
): UnusedRiotV3ComponentMember[] {
  return analysis.components.flatMap((component) =>
    component.script.properties
      .filter(
        (property) => !isComponentMemberRead(analysis, component, property),
      )
      .map((property) => ({
        name: property.name,
        start: property.sourceOffset,
        end: property.sourceOffset + property.name.length,
      })),
  );
}

function isComponentMemberRead(
  analysis: RiotV3DocumentAnalysis,
  component: RiotV3ComponentAnalysis,
  property: ScriptProperty,
): boolean {
  const selfMethodBodyRanges = getSelfMethodBodyRanges(
    analysis,
    component,
    property.name,
  );
  return getRiotPropertyOccurrences(
    analysis.snapshot,
    component.component,
    component.template.expressions,
    property.name,
    component.script,
  ).some(
    (occurrence) =>
      (occurrence.role === 'read' || occurrence.role === 'readWrite') &&
      !selfMethodBodyRanges.some(
        (range) =>
          occurrence.start >= range.start && occurrence.end <= range.end,
      ),
  );
}

function getSelfMethodBodyRanges(
  analysis: RiotV3DocumentAnalysis,
  component: RiotV3ComponentAnalysis,
  name: string,
): Array<{ start: number; end: number }> {
  return component.component.scripts.flatMap((script) => {
    const text = analysis.snapshot.getText(script.start, script.end);
    return scanRiotV3Methods(text)
      .filter((method) => text.slice(method.nameStart, method.nameEnd) === name)
      .map((method) => ({
        start: script.start + method.bodyStart,
        end: script.start + method.bodyEnd,
      }));
  });
}
