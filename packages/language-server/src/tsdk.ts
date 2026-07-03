import * as path from 'node:path';

type InitializationOptions = {
  typescript?: {
    tsdk?: unknown;
  };
};

export function resolveTsdkPath(initializationOptions: unknown): string {
  return getConfiguredTsdkPath(initializationOptions) ?? getBundledTsdkPath();
}

export function getConfiguredTsdkPath(
  initializationOptions: unknown,
): string | undefined {
  if (!isInitializationOptions(initializationOptions)) {
    return;
  }
  const tsdk = initializationOptions.typescript?.tsdk;
  return typeof tsdk === 'string' && tsdk.length > 0 ? tsdk : undefined;
}

export function getBundledTsdkPath(): string {
  return path.dirname(require.resolve('typescript/lib/typescript.js'));
}

function isInitializationOptions(
  value: unknown,
): value is InitializationOptions {
  return typeof value === 'object' && value !== null;
}
