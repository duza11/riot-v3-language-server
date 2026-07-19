import type { RiotV3LanguageOptions } from '../core/options';

export function getRiotV3LanguageOptions(
  initializationOptions: unknown,
): Required<RiotV3LanguageOptions> {
  const allowDynamicPropertiesFromAnyAssignments =
    isRecord(initializationOptions) &&
    isRecord(initializationOptions.riotV3) &&
    initializationOptions.riotV3.allowDynamicPropertiesFromAnyAssignments ===
      true;

  return { allowDynamicPropertiesFromAnyAssignments };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
