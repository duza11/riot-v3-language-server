import * as ts from 'typescript';
import {
  isIdentifierStart,
  scanIdentifierEnd,
  scanJavaScriptNonCode,
} from '../scanners';
import type { ScriptBlock } from '../types';
import { parseRiotMethodParameters } from './jsdoc';
import { scanFunctionLikeEnd, scanRiotV3MethodDefinition } from './syntax';
import type { ScriptEventHandlerScope } from './types';

export function getScriptEventHandlerScopes(
  snapshot: ts.IScriptSnapshot,
  scripts: ScriptBlock[],
  aliases: string[],
): ScriptEventHandlerScope[] {
  return scripts.flatMap((script) => {
    const text = snapshot.getText(script.start, script.end);
    return [
      ...getRiotMethodScopes(text, script.start),
      ...getAssignedFunctionScopes(text, script.start, new Set(aliases)),
    ];
  });
}

function getRiotMethodScopes(
  text: string,
  sourceOffset: number,
): ScriptEventHandlerScope[] {
  const scopes: ScriptEventHandlerScope[] = [];
  let offset = 0;
  let braceDepth = 0;
  while (offset < text.length) {
    const skipped = scanJavaScriptNonCode(text, offset);
    if (skipped !== undefined) {
      offset = skipped;
      continue;
    }
    if (braceDepth === 0 && isIdentifierStart(text[offset])) {
      const functionEnd = scanFunctionLikeEnd(text, offset);
      if (functionEnd !== undefined) {
        offset = functionEnd;
        continue;
      }
      const method = scanRiotV3MethodDefinition(text, offset);
      if (method) {
        const parameterName = parseRiotMethodParameters(
          text,
          method.nameEnd,
        )?.[0];
        if (parameterName) {
          scopes.push({
            handlerName: text.slice(method.nameStart, method.nameEnd),
            parameterName,
            bodyStart: sourceOffset + method.bodyStart,
            bodyEnd: sourceOffset + method.bodyEnd - 1,
          });
        }
        offset = method.bodyEnd;
        continue;
      }
      offset = scanIdentifierEnd(text, offset);
      continue;
    }
    if (text[offset] === '{') {
      braceDepth++;
    } else if (text[offset] === '}') {
      braceDepth--;
    }
    offset++;
  }
  return scopes;
}

function getAssignedFunctionScopes(
  text: string,
  sourceOffset: number,
  aliases: Set<string>,
): ScriptEventHandlerScope[] {
  const sourceFile = ts.createSourceFile(
    'component.js',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const scopes: ScriptEventHandlerScope[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      isInstanceOwner(node.left.expression, aliases) &&
      (ts.isFunctionExpression(node.right) || ts.isArrowFunction(node.right))
    ) {
      const parameter = node.right.parameters[0]?.name;
      if (parameter && ts.isIdentifier(parameter)) {
        const body = node.right.body;
        scopes.push({
          handlerName: node.left.name.text,
          parameterName: parameter.text,
          bodyStart:
            sourceOffset +
            body.getStart(sourceFile) +
            (ts.isBlock(body) ? 1 : 0),
          bodyEnd: sourceOffset + body.getEnd() - (ts.isBlock(body) ? 1 : 0),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return scopes;
}

function isInstanceOwner(expression: ts.Expression, aliases: Set<string>) {
  return (
    expression.kind === ts.SyntaxKind.ThisKeyword ||
    (ts.isIdentifier(expression) && aliases.has(expression.text))
  );
}
