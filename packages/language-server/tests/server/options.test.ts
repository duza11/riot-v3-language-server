import { describe, expect, it } from 'vitest';
import { getRiotV3LanguageOptions } from '../../src/server/options';

describe('Riot v3 initialization options', () => {
  it('enables dynamic object properties when explicitly configured', () => {
    // Arrange
    const initializationOptions = {
      riotV3: { allowDynamicObjectProperties: true },
    };

    // Act
    const options = getRiotV3LanguageOptions(initializationOptions);

    // Assert
    expect(options).toEqual({ allowDynamicObjectProperties: true });
  });

  it.each([
    undefined,
    {},
    { riotV3: {} },
    { riotV3: { allowDynamicObjectProperties: false } },
    { riotV3: { allowDynamicObjectProperties: 'true' } },
  ])('keeps strict object properties for %j', (initializationOptions) => {
    // Act
    const options = getRiotV3LanguageOptions(initializationOptions);

    // Assert
    expect(options).toEqual({ allowDynamicObjectProperties: false });
  });
});
