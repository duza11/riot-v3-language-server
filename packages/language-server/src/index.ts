import {
  createConnection,
  createServer,
  createTypeScriptProject,
  loadTsdkByPath,
} from '@volar/language-server/node';
import { create as createCssService } from 'volar-service-css';
import { create as createEmmetService } from 'volar-service-emmet';
import { create as createHtmlService } from 'volar-service-html';
import { create as createTypeScriptServices } from 'volar-service-typescript';
import { riotV3LanguagePlugin } from './languagePlugin';
import { createRiotV3ServicePlugin } from './server/servicePlugin';
import { resolveTsdkPath } from './tsdk';

const connection = createConnection();
const server = createServer(connection);

connection.listen();

connection.onInitialize((params) => {
  const tsdk = loadTsdkByPath(
    resolveTsdkPath(params.initializationOptions),
    params.locale,
  );
  return server.initialize(
    params,
    createTypeScriptProject(tsdk.typescript, tsdk.diagnosticMessages, () => ({
      languagePlugins: [riotV3LanguagePlugin],
    })),
    [
      createHtmlService(),
      createCssService(),
      createEmmetService(),
      ...createTypeScriptServices(tsdk.typescript),
      createRiotV3ServicePlugin(),
    ],
  );
});

connection.onInitialized(server.initialized);

connection.onShutdown(server.shutdown);
