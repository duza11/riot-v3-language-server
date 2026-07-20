import type { ScriptProperty } from '../types';

export interface ScriptPropertyAssignment {
  path: string[];
  sourceOffset: number;
  typeName: string;
  typeOrigin: ScriptProperty['typeOrigin'];
  isAssignment: boolean;
  hasExplicitFirstParameterType?: boolean;
}

export interface AssignedPropertyType {
  typeName: string;
  typeOrigin: ScriptProperty['typeOrigin'];
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
