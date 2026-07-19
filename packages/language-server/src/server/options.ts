import type { RiotV3LanguageOptions } from '../core/options';

export function getRiotV3LanguageOptions(
  initializationOptions: unknown,
): Required<RiotV3LanguageOptions> {
  const allowDynamicObjectProperties =
    isRecord(initializationOptions) &&
    isRecord(initializationOptions.riotV3) &&
    initializationOptions.riotV3.allowDynamicObjectProperties === true;

  return { allowDynamicObjectProperties };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
