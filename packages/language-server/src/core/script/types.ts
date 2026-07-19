import type { ScriptProperty } from '../types';

export interface ScriptPropertyAssignment {
  path: string[];
  sourceOffset: number;
  typeName: string;
  typeOrigin: ScriptProperty['typeOrigin'];
  isAssignment: boolean;
}

export interface AssignedPropertyType {
  typeName: string;
  typeOrigin: ScriptProperty['typeOrigin'];
}

export interface ScriptJSDocTypedBinding {
  name: string;
  typeName: string;
  scopeStart: number;
  scopeEnd: number;
}
