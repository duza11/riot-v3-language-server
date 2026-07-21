import type { ScriptProperty } from '../types';

export const dynamicStringIndexProperty = '[key: string]';

export interface ScriptPropertyAssignment {
  path: string[];
  sourceOffset: number;
  typeName: string;
  typeOrigin: ScriptProperty['typeOrigin'];
  isAssignment: boolean;
  explicitTypePaths?: string[][];
  hasExplicitFirstParameterType?: boolean;
}

export interface AssignedPropertyType {
  typeName: string;
  typeOrigin: ScriptProperty['typeOrigin'];
  explicitTypePaths?: string[][];
  hasExplicitFirstParameterType?: boolean;
}

export interface ScriptJSDocTypedBinding {
  name: string;
  typeName: string;
  scopeStart: number;
  scopeEnd: number;
}

export interface ScriptEventHandlerScope {
  handlerName: string;
  parameterName: string;
  bodyStart: number;
  bodyEnd: number;
}
