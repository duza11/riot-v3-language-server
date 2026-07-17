export {
  getComponentScriptLanguageId,
  getScriptJSDocTypedBindings,
  getScriptProperties,
  getScriptThisAliases,
  scanInstancePropertyOccurrences,
  scanRiotV3MethodProperties,
} from './analysis';
export {
  findPrecedingJSDoc,
  getScriptJSDocTypedefs,
  parseJSDocType,
} from './jsdoc';
export type { ScriptJSDocTypedBinding } from './types';
export { generateScriptVirtualText } from './virtualCode';
