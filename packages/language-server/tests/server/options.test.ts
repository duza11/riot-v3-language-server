import { describe, expect, it } from 'vitest';
import { getRiotV3LanguageOptions } from '../../src/server/options';

describe('Riot v3 initialization options', () => {
  it('enables dynamic properties from any assignments when explicitly configured', () => {
    // Arrange
    const initializationOptions = {
      riotV3: { allowDynamicPropertiesFromAnyAssignments: true },
    };

    // Act
    const options = getRiotV3LanguageOptions(initializationOptions);

    // Assert
    expect(options).toEqual({
      allowDynamicPropertiesFromAnyAssignments: true,
    });
  });

  it.each([
    undefined,
    {},
    { riotV3: {} },
    { riotV3: { allowDynamicPropertiesFromAnyAssignments: false } },
    { riotV3: { allowDynamicPropertiesFromAnyAssignments: 'true' } },
  ])('keeps strict object properties for %j', (initializationOptions) => {
    // Act
    const options = getRiotV3LanguageOptions(initializationOptions);

    // Assert
    expect(options).toEqual({
      allowDynamicPropertiesFromAnyAssignments: false,
    });
  });
});
