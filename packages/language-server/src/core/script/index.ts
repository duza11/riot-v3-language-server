export {
  getComponentScriptLanguageId,
  getScriptJSDocTypedBindings,
  getScriptProperties,
  getScriptThisAliases,
  scanInstancePropertyOccurrences,
  scanRiotV3MethodProperties,
  scanRiotV3Methods,
} from './analysis';
export { getScriptEventHandlerScopes } from './eventHandlers';
export { getScriptEventItemAccesses } from './eventItems';
export {
  findPrecedingJSDoc,
  getScriptJSDocTypedefs,
  parseJSDocType,
} from './jsdoc';
export type {
  ScriptEventHandlerScope,
  ScriptEventItemAccess,
  ScriptJSDocTypedBinding,
} from './types';
export { generateScriptVirtualText } from './virtualCode';
