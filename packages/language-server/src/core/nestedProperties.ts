import * as ts from 'typescript';
import { getScriptProperties, getScriptThisAliases } from './script';
import type { TemplateAnalysis, TemplateExpression } from './template';
import { shouldPrefixTemplateIdentifier } from './template';
import type { RiotV3Component, ScriptBlock } from './types';

export interface NestedPropertyOccurrence {
  path: string[];
  start: number;
  end: number;
  isDeclaration: boolean;
}

interface ResolvedPath {
  path: string[];
  segments: NestedPropertyOccurrence[];
}

export function getNestedPropertyOccurrences(
  snapshot: ts.IScriptSnapshot,
  component: RiotV3Component,
  templateAnalysis: TemplateAnalysis,
): NestedPropertyOccurrence[] {
  const rootNames = new Set(
    getScriptProperties(snapshot, component.scripts).map(
      (property) => property.name,
    ),
  );
  const aliases = new Set(getScriptThisAliases(snapshot, component.scripts));
  const scriptOccurrences = component.scripts.flatMap((script) =>
    getScriptOccurrences(snapshot, script, aliases, rootNames),
  );
  const templateOccurrences = templateAnalysis.expressions.flatMap(
    (expression) => getTemplateOccurrences(expression, rootNames),
  );

  return [
    ...scriptOccurrences.filter((occurrence) => occurrence.isDeclaration),
    ...scriptOccurrences.filter((occurrence) => !occurrence.isDeclaration),
    ...templateOccurrences,
  ];
}

function getScriptOccurrences(
  snapshot: ts.IScriptSnapshot,
  script: ScriptBlock,
  aliases: Set<string>,
  rootNames: Set<string>,
): NestedPropertyOccurrence[] {
  const text = snapshot.getText(script.start, script.end);
  const sourceFile = ts.createSourceFile(
    'component.js',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const occurrences = new Map<string, NestedPropertyOccurrence>();

  const add = (occurrence: NestedPropertyOccurrence): void => {
    if (occurrence.path.length < 2 || !rootNames.has(occurrence.path[0])) {
      return;
    }
    const key = `${occurrence.start}:${occurrence.end}:${occurrence.path.join('.')}`;
    const existing = occurrences.get(key);
    if (!existing || occurrence.isDeclaration) {
      occurrences.set(key, occurrence);
    }
  };

  const resolvePath = (node: ts.Expression): ResolvedPath | undefined => {
    const expression = unwrapExpression(node);
    if (expression.kind === ts.SyntaxKind.ThisKeyword) {
      return { path: [], segments: [] };
    }
    if (ts.isIdentifier(expression) && aliases.has(expression.text)) {
      return { path: [], segments: [] };
    }
    if (!ts.isPropertyAccessExpression(expression)) {
      return;
    }
    const parent = resolvePath(expression.expression);
    if (!parent) {
      return;
    }
    const path = [...parent.path, expression.name.text];
    return {
      path,
      segments: [
        ...parent.segments,
        {
          path,
          start: script.start + expression.name.getStart(sourceFile),
          end: script.start + expression.name.getEnd(),
          isDeclaration: false,
        },
      ],
    };
  };

  const addResolvedPath = (
    resolved: ResolvedPath,
    declarationEnd?: number,
  ): void => {
    for (const segment of resolved.segments) {
      add({
        ...segment,
        isDeclaration: segment.end === declarationEnd,
      });
    }
  };

  const addObjectDeclarations = (
    node: ts.Expression,
    parentPath: string[],
  ): void => {
    const expression = unwrapExpression(node);
    if (!ts.isObjectLiteralExpression(expression)) {
      return;
    }
    for (const property of expression.properties) {
      if (!ts.isPropertyAssignment(property)) {
        continue;
      }
      const name = getStaticPropertyName(
        property.name,
        sourceFile,
        script.start,
      );
      if (!name) {
        continue;
      }
      const path = [...parentPath, name.text];
      add({
        path,
        start: name.start,
        end: name.end,
        isDeclaration: true,
      });
      addObjectDeclarations(property.initializer, path);
    }
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const resolved = resolvePath(node.left);
      if (resolved) {
        addResolvedPath(resolved, resolved.segments.at(-1)?.end);
        addObjectDeclarations(node.right, resolved.path);
      }
    } else if (ts.isPropertyAccessExpression(node)) {
      const resolved = resolvePath(node);
      if (resolved) {
        addResolvedPath(resolved);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return [...occurrences.values()];
}

function getTemplateOccurrences(
  expression: TemplateExpression,
  rootNames: Set<string>,
): NestedPropertyOccurrence[] {
  const prefix = '(';
  const sourceFile = ts.createSourceFile(
    'template.js',
    `${prefix}${expression.text})`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const occurrences = new Map<string, NestedPropertyOccurrence>();

  const resolvePath = (node: ts.Expression): ResolvedPath | undefined => {
    const current = unwrapExpression(node);
    if (current.kind === ts.SyntaxKind.ThisKeyword) {
      return { path: [], segments: [] };
    }
    if (ts.isIdentifier(current)) {
      const localStart = current.getStart(sourceFile) - prefix.length;
      if (
        !rootNames.has(current.text) ||
        !shouldPrefixTemplateIdentifier(
          expression.text,
          localStart,
          current.text,
        )
      ) {
        return;
      }
      return {
        path: [current.text],
        segments: [],
      };
    }
    if (!ts.isPropertyAccessExpression(current)) {
      return;
    }
    const parent = resolvePath(current.expression);
    if (!parent) {
      return;
    }
    const path = [...parent.path, current.name.text];
    const start =
      expression.sourceOffset +
      current.name.getStart(sourceFile) -
      prefix.length;
    return {
      path,
      segments: [
        ...parent.segments,
        {
          path,
          start,
          end: start + current.name.text.length,
          isDeclaration: false,
        },
      ],
    };
  };

  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node)) {
      const resolved = resolvePath(node);
      for (const segment of resolved?.segments ?? []) {
        if (segment.path.length >= 2) {
          occurrences.set(
            `${segment.start}:${segment.end}:${segment.path.join('.')}`,
            segment,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return [...occurrences.values()];
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function getStaticPropertyName(
  name: ts.PropertyName,
  sourceFile: ts.SourceFile,
  sourceOffset: number,
): { text: string; start: number; end: number } | undefined {
  if (ts.isIdentifier(name)) {
    return {
      text: name.text,
      start: sourceOffset + name.getStart(sourceFile),
      end: sourceOffset + name.getEnd(),
    };
  }
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return {
      text: name.text,
      start: sourceOffset + name.getStart(sourceFile) + 1,
      end: sourceOffset + name.getEnd() - 1,
    };
  }
}
