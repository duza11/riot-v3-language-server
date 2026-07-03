import { describe, expect, it } from 'vitest';
import {
  getBundledTsdkPath,
  getConfiguredTsdkPath,
  resolveTsdkPath,
} from '../src/tsdk';

describe('tsdk resolution', () => {
  it('uses the configured tsdk when it is provided', () => {
    expect(
      resolveTsdkPath({
        typescript: { tsdk: '/workspace/node_modules/typescript/lib' },
      }),
    ).toBe('/workspace/node_modules/typescript/lib');
  });

  it('ignores missing or invalid configured tsdk values', () => {
    expect(getConfiguredTsdkPath(undefined)).toBeUndefined();
    expect(getConfiguredTsdkPath({})).toBeUndefined();
    expect(getConfiguredTsdkPath({ typescript: { tsdk: '' } })).toBeUndefined();
    expect(getConfiguredTsdkPath({ typescript: { tsdk: 1 } })).toBeUndefined();
  });

  it('falls back to the bundled TypeScript lib directory', () => {
    expect(resolveTsdkPath(undefined)).toBe(getBundledTsdkPath());
    expect(getBundledTsdkPath()).toMatch(/typescript[/\\]lib$/);
  });
});
