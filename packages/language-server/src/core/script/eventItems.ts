import * as ts from 'typescript';
import type { ScriptEventHandlerScope, ScriptEventItemAccess } from './types';

export function getScriptEventItemAccesses(
  snapshot: ts.IScriptSnapshot,
  handlerScopes: ScriptEventHandlerScope[],
): ScriptEventItemAccess[] {
  const accesses = new Map<string, ScriptEventItemAccess>();
  for (const handlerScope of handlerScopes) {
    const text = snapshot.getText(handlerScope.bodyStart, handlerScope.bodyEnd);
    const sourceFile = ts.createSourceFile(
      'event-handler.js',
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAccessExpression(node)) {
        const access = getEventItemAccess(node, handlerScope, sourceFile);
        if (access && !isNestedEventItemRoot(node)) {
          accesses.set(
            `${access.handlerName}:${access.terminal.start}:${access.terminal.end}:${access.path.join('.')}`,
            access,
          );
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return [...accesses.values()];
}

function getEventItemAccess(
  node: ts.PropertyAccessExpression,
  handlerScope: ScriptEventHandlerScope,
  sourceFile: ts.SourceFile,
): ScriptEventItemAccess | undefined {
  const names: string[] = [];
  let current: ts.Expression = node;
  while (ts.isPropertyAccessExpression(current)) {
    names.unshift(current.name.text);
    current = current.expression;
  }
  if (
    !ts.isIdentifier(current) ||
    current.text !== handlerScope.parameterName ||
    names[0] !== 'item'
  ) {
    return;
  }
  return {
    handlerName: handlerScope.handlerName,
    path: names.slice(1),
    terminal: {
      start: handlerScope.bodyStart + node.name.getStart(sourceFile),
      end: handlerScope.bodyStart + node.name.getEnd(),
    },
  };
}

function isNestedEventItemRoot(node: ts.PropertyAccessExpression): boolean {
  return (
    node.name.text === 'item' &&
    ((ts.isPropertyAccessExpression(node.parent) &&
      node.parent.expression === node) ||
      (ts.isElementAccessExpression(node.parent) &&
        node.parent.expression === node))
  );
}
