import type { ScriptEventItemAccess } from './script';
import type { TemplateEventBinding } from './template';

export function getEventEachLocalReadOffsets(
  accesses: ScriptEventItemAccess[],
  bindings: TemplateEventBinding[],
): Set<number> {
  const offsets = new Set<number>();
  for (const access of accesses) {
    for (const binding of bindings) {
      if (binding.handlerName !== access.handlerName) {
        continue;
      }
      const scope = binding.eachScopes.at(-1);
      if (!scope || scope.kind !== 'explicit') {
        continue;
      }
      if (!access.path.length) {
        for (const localName of scope.localNames) {
          offsets.add(localName.sourceOffset);
        }
        continue;
      }
      const localName = scope.localNames.find(
        (candidate) => candidate.name === access.path[0],
      );
      if (localName) {
        offsets.add(localName.sourceOffset);
      }
    }
  }
  return offsets;
}
