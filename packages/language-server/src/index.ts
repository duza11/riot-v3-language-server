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
import { createRiotV3LanguagePlugin } from './languagePlugin';
import { getRiotV3LanguageOptions } from './server/options';
import { createRiotV3ServicePlugin } from './server/servicePlugin';
import { resolveTsdkPath } from './tsdk';

const connection = createConnection();
const server = createServer(connection);

connection.listen();

connection.onInitialize((params) => {
  const riotV3Options = getRiotV3LanguageOptions(params.initializationOptions);
  const tsdk = loadTsdkByPath(
    resolveTsdkPath(params.initializationOptions),
    params.locale,
  );
  return server.initialize(
    params,
    createTypeScriptProject(tsdk.typescript, tsdk.diagnosticMessages, () => ({
      languagePlugins: [createRiotV3LanguagePlugin(riotV3Options)],
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
