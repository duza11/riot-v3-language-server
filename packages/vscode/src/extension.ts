import { activate as activateAutoInsertion } from '@volar/vscode/lib/features/autoInsertion';
import { getTsdk } from '@volar/vscode/lib/features/tsVersion';
import {
  type BaseLanguageClient,
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from '@volar/vscode/node';
import * as vscode from 'vscode';

declare const __RIOT_V3_ENABLE_VOLAR_LABS__: boolean;

let client: BaseLanguageClient;

export async function activate(context: vscode.ExtensionContext) {
  const serverModule = vscode.Uri.joinPath(
    context.extensionUri,
    'server',
    'index.js',
  );
  const runOptions = { execArgv: <string[]>[] };
  const debugOptions = { execArgv: ['--nolazy', '--inspect=' + 6009] };
  const serverOptions: ServerOptions = {
    run: {
      module: serverModule.fsPath,
      transport: TransportKind.ipc,
      options: runOptions,
    },
    debug: {
      module: serverModule.fsPath,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  };
  const tsdk = await getTsdk(context);
  if (!tsdk) {
    throw new Error('TypeScript SDK was not found.');
  }
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: 'riot_v3' }],
    initializationOptions: {
      typescript: {
        tsdk: tsdk.tsdk,
      },
    },
  };
  client = new LanguageClient(
    'riot-v3-language-server',
    'Riot.js v3 Language Server',
    serverOptions,
    clientOptions,
  );
  await client.start();

  activateAutoInsertion('riot-v3', client);

  if (__RIOT_V3_ENABLE_VOLAR_LABS__) {
    const [serverProtocol, { createLabsInfo }] = await Promise.all([
      import('@volar/language-server/protocol'),
      import('@volar/vscode'),
    ]);
    const labsInfo = createLabsInfo(serverProtocol);
    labsInfo.addLanguageClient(client);
    return labsInfo.extensionExports;
  }
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
