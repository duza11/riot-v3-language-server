import * as ts from 'typescript';
import { getScriptProperties, getScriptThisAliases } from './script';
import type { TemplateAnalysis, TemplateExpression } from './template';
import {
  getResolvedEachLocalName,
  shouldPrefixTemplateIdentifier,
} from './template';
import type { RiotV3Component, ScriptBlock } from './types';

export interface NestedPropertyOccurrence {
  path: string[];
  symbolKey?: string;
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
  const rootProperties = getScriptProperties(snapshot, component.scripts);
  const rootNames = new Set(rootProperties.map((property) => property.name));
  const typedefNavigation = getTypedefNavigation(
    snapshot,
    component.scripts,
    rootProperties,
  );
  const aliases = new Set(getScriptThisAliases(snapshot, component.scripts));
  const inlineTypeDeclarations = getInlineTypeDeclarations(
    snapshot,
    component.scripts,
    rootProperties,
    aliases,
  );
  const scriptOccurrences = component.scripts.flatMap((script) =>
    getScriptOccurrences(
      snapshot,
      script,
      aliases,
      rootNames,
      typedefNavigation.symbols,
    ),
  );
  const templateOccurrences = templateAnalysis.expressions.flatMap(
    (expression) =>
      getTemplateOccurrences(
        expression,
        rootNames,
        typedefNavigation.symbols,
        templateAnalysis.eachScopes,
      ),
  );

  return [
    ...typedefNavigation.declarations,
    ...inlineTypeDeclarations,
    ...scriptOccurrences.filter((occurrence) => occurrence.isDeclaration),
    ...scriptOccurrences.filter((occurrence) => !occurrence.isDeclaration),
    ...templateOccurrences,
  ];
}

function getInlineTypeDeclarations(
  snapshot: ts.IScriptSnapshot,
  scripts: ScriptBlock[],
  rootProperties: ReturnType<typeof getScriptProperties>,
  aliases: Set<string>,
): NestedPropertyOccurrence[] {
  const declarations: NestedPropertyOccurrence[] = [];
  for (const property of rootProperties) {
    const script = scripts.find(
      (candidate) =>
        property.sourceOffset >= candidate.start &&
        property.sourceOffset < candidate.end,
    );
    if (!script) {
      continue;
    }
    const text = snapshot.getText(script.start, script.end);
    const propertyOffset = property.sourceOffset - script.start;
    const commentEnd = text.lastIndexOf('*/', propertyOffset);
    const commentStart = text.lastIndexOf('/**', commentEnd);
    if (commentStart === -1 || commentEnd === -1) {
      continue;
    }
    const qualifier = text.slice(commentEnd + 2, propertyOffset);
    if (!isInstancePropertyQualifier(qualifier, aliases)) {
      continue;
    }
    const comment = text.slice(commentStart, commentEnd + 2);
    const typeRange = getJSDocTypeRange(comment);
    if (!typeRange) {
      continue;
    }
    const prefix = 'type InlineProperty = ';
    const sourceFile = ts.createSourceFile(
      'inline-property.ts',
      `${prefix}${typeRange.text};`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const typeAlias = sourceFile.statements.find(ts.isTypeAliasDeclaration);
    if (!typeAlias) {
      continue;
    }
    const sourceOffset =
      script.start + commentStart + typeRange.start - prefix.length;
    addInlineTypeDeclarations(
      typeAlias.type,
      [property.name],
      sourceFile,
      sourceOffset,
      declarations,
    );
  }
  return declarations;
}

function isInstancePropertyQualifier(
  text: string,
  aliases: Set<string>,
): boolean {
  const qualifier = text.trim().replace(/\s*\.\s*$/, '');
  return qualifier === 'this' || aliases.has(qualifier);
}

function getJSDocTypeRange(
  comment: string,
): { text: string; start: number } | undefined {
  const tag = /@type\b/.exec(comment);
  if (!tag) {
    return;
  }
  let start = tag.index + tag[0].length;
  while (/\s/.test(comment[start] ?? '')) {
    start++;
  }
  if (comment[start] !== '{') {
    return;
  }
  let depth = 1;
  for (let end = start + 1; end < comment.length; end++) {
    if (comment[end] === '{') {
      depth++;
    } else if (comment[end] === '}') {
      depth--;
      if (depth === 0) {
        return { text: comment.slice(start + 1, end), start: start + 1 };
      }
    }
  }
}

function addInlineTypeDeclarations(
  node: ts.TypeNode,
  parentPath: string[],
  sourceFile: ts.SourceFile,
  sourceOffset: number,
  declarations: NestedPropertyOccurrence[],
): void {
  if (ts.isParenthesizedTypeNode(node)) {
    addInlineTypeDeclarations(
      node.type,
      parentPath,
      sourceFile,
      sourceOffset,
      declarations,
    );
    return;
  }
  if (ts.isArrayTypeNode(node)) {
    addInlineTypeDeclarations(
      node.elementType,
      [...parentPath, '[]'],
      sourceFile,
      sourceOffset,
      declarations,
    );
    return;
  }
  if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
    for (const type of node.types) {
      addInlineTypeDeclarations(
        type,
        parentPath,
        sourceFile,
        sourceOffset,
        declarations,
      );
    }
    return;
  }
  if (!ts.isTypeLiteralNode(node)) {
    return;
  }
  for (const member of node.members) {
    if (!ts.isPropertySignature(member) || !member.type) {
      continue;
    }
    const name = getStaticPropertyName(member.name, sourceFile, sourceOffset);
    if (!name) {
      continue;
    }
    const path = [...parentPath, name.text];
    declarations.push({
      path,
      start: name.start,
      end: name.end,
      isDeclaration: true,
    });
    addInlineTypeDeclarations(
      member.type,
      path,
      sourceFile,
      sourceOffset,
      declarations,
    );
  }
}

function getScriptOccurrences(
  snapshot: ts.IScriptSnapshot,
  script: ScriptBlock,
  aliases: Set<string>,
  rootNames: Set<string>,
  symbols: Map<string, string>,
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
    occurrence.symbolKey ??= symbols.get(occurrence.path.join('.'));
    const key = `${occurrence.start}:${occurrence.end}:${occurrence.symbolKey ?? occurrence.path.join('.')}`;
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
    if (ts.isElementAccessExpression(expression)) {
      const parent = resolvePath(expression.expression);
      const part = getElementPathPart(
        expression.argumentExpression,
        sourceFile,
        script.start,
      );
      if (!parent || !part) {
        return;
      }
      const path = [...parent.path, part.text];
      return {
        path,
        segments: [
          ...parent.segments,
          ...(part.start === undefined
            ? []
            : [
                {
                  path,
                  start: part.start,
                  end: part.end ?? part.start,
                  isDeclaration: false,
                },
              ]),
        ],
      };
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
    if (ts.isArrayLiteralExpression(expression)) {
      for (const element of expression.elements) {
        if (!ts.isSpreadElement(element)) {
          addObjectDeclarations(element, [...parentPath, '[]']);
        }
      }
      return;
    }
    if (!ts.isObjectLiteralExpression(expression)) {
      return;
    }
    for (const property of expression.properties) {
      if (
        !ts.isPropertyAssignment(property) &&
        !ts.isMethodDeclaration(property) &&
        !ts.isGetAccessorDeclaration(property) &&
        !ts.isSetAccessorDeclaration(property)
      ) {
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
      if (ts.isPropertyAssignment(property)) {
        addObjectDeclarations(property.initializer, path);
      }
    }
  };

  const addBindingDeclarations = (
    pattern: ts.ObjectBindingPattern,
    parentPath: string[],
  ): void => {
    for (const element of pattern.elements) {
      if (element.dotDotDotToken) {
        continue;
      }
      const propertyName =
        element.propertyName ??
        (ts.isIdentifier(element.name) ? element.name : undefined);
      if (!propertyName) {
        continue;
      }
      const name = getStaticPropertyName(
        propertyName,
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
      if (ts.isObjectBindingPattern(element.name)) {
        addBindingDeclarations(element.name, path);
      }
    }
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer
    ) {
      const resolved = resolvePath(node.initializer);
      if (resolved) {
        addBindingDeclarations(node.name, resolved.path);
      }
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const resolved = resolvePath(node.left);
      if (resolved) {
        addResolvedPath(resolved, resolved.segments.at(-1)?.end);
        addObjectDeclarations(node.right, resolved.path);
      }
    } else if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
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
  symbols: Map<string, string>,
  eachScopes: TemplateAnalysis['eachScopes'],
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
      const localName = getResolvedEachLocalName(
        expression,
        localStart,
        current.text,
      );
      if (localName) {
        const collectionPath = resolveEachCollectionPath(
          localName,
          expression.localDefinitions,
          rootNames,
        );
        return collectionPath
          ? { path: [...collectionPath, '[]'], segments: [] }
          : undefined;
      }
      const shorthandScope = [...eachScopes]
        .filter(
          (scope) =>
            scope.localNames.length === 0 &&
            expression.sourceOffset !== scope.collectionOffset &&
            expression.sourceOffset >= scope.start &&
            expression.sourceOffset < scope.end,
        )
        .sort((a, b) => b.depth - a.depth)[0];
      if (shorthandScope) {
        const collectionPath = resolveEachCollectionPath(
          {
            name: '',
            sourceOffset: shorthandScope.sourceOffset,
            kind: 'item',
            collectionOffset: shorthandScope.collectionOffset,
            collectionText: shorthandScope.collectionText,
            collectionLocalNames: shorthandScope.collectionLocalNames,
          },
          expression.localDefinitions,
          rootNames,
        );
        if (collectionPath) {
          const path = [...collectionPath, '[]', current.text];
          const start = expression.sourceOffset + localStart;
          return {
            path,
            segments: [
              {
                path,
                start,
                end: start + current.text.length,
                isDeclaration: false,
              },
            ],
          };
        }
      }
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
    if (ts.isElementAccessExpression(current)) {
      const parent = resolvePath(current.expression);
      const part = getElementPathPart(
        current.argumentExpression,
        sourceFile,
        expression.sourceOffset - prefix.length,
      );
      if (!parent || !part) {
        return;
      }
      const path = [...parent.path, part.text];
      return {
        path,
        segments: [
          ...parent.segments,
          ...(part.start === undefined
            ? []
            : [
                {
                  path,
                  start: part.start,
                  end: part.end ?? part.start,
                  isDeclaration: false,
                },
              ]),
        ],
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
    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node) ||
      ts.isIdentifier(node)
    ) {
      const resolved = resolvePath(node);
      for (const segment of resolved?.segments ?? []) {
        if (segment.path.length >= 2) {
          segment.symbolKey ??= symbols.get(segment.path.join('.'));
          occurrences.set(
            `${segment.start}:${segment.end}:${segment.symbolKey ?? segment.path.join('.')}`,
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

interface TypedefProperty {
  name: string;
  typeName: string;
  start: number;
  end: number;
}

interface TypedefDefinition {
  name: string;
  properties: TypedefProperty[];
}

function getTypedefNavigation(
  snapshot: ts.IScriptSnapshot,
  scripts: ScriptBlock[],
  rootProperties: ReturnType<typeof getScriptProperties>,
): {
  declarations: NestedPropertyOccurrence[];
  symbols: Map<string, string>;
} {
  const definitions = new Map<string, TypedefDefinition>();
  for (const script of scripts) {
    const text = snapshot.getText(script.start, script.end);
    for (const match of text.matchAll(/\/\*\*[\s\S]*?\*\//g)) {
      const comment = match[0];
      const typedef = /@typedef\s*\{[^}]+\}\s*([A-Za-z_$][\w$]*)/.exec(comment);
      if (!typedef || match.index === undefined) {
        continue;
      }
      const properties: TypedefProperty[] = [];
      for (const property of comment.matchAll(
        /@property\s*\{([^}]+)\}\s*\[?([A-Za-z_$][\w$]*)(?:=[^\]\s]+)?\]?/g,
      )) {
        if (property.index === undefined) {
          continue;
        }
        const relativeNameStart =
          property.index + property[0].lastIndexOf(property[2]);
        properties.push({
          name: property[2],
          typeName: property[1].trim(),
          start: script.start + match.index + relativeNameStart,
          end:
            script.start + match.index + relativeNameStart + property[2].length,
        });
      }
      definitions.set(typedef[1], { name: typedef[1], properties });
    }
  }

  const declarations = new Map<string, NestedPropertyOccurrence>();
  const associations: { path: string; symbolKey: string }[] = [];
  const addTypeProperties = (
    rootPath: string[],
    typeName: string,
    visited: Set<string>,
  ): void => {
    for (const definition of definitions.values()) {
      for (const containerPath of getTypeContainerPaths(
        typeName,
        definition.name,
      )) {
        const ownerPath = [...rootPath, ...containerPath];
        const visitKey = `${ownerPath.join('.')}:${definition.name}`;
        if (visited.has(visitKey)) {
          continue;
        }
        const nextVisited = new Set(visited).add(visitKey);
        for (const property of definition.properties) {
          const path = [...ownerPath, property.name];
          const symbolKey = `typedef:${definition.name}.${property.name}`;
          associations.push({ path: path.join('.'), symbolKey });
          declarations.set(symbolKey, {
            path,
            symbolKey,
            start: property.start,
            end: property.end,
            isDeclaration: true,
          });
          addTypeProperties(path, property.typeName, nextVisited);
        }
      }
    }
  };

  for (const property of rootProperties) {
    addTypeProperties([property.name], property.typeName, new Set());
  }

  const parents = new Map<string, string>();
  const find = (key: string): string => {
    const parent = parents.get(key);
    if (!parent) {
      parents.set(key, key);
      return key;
    }
    if (parent === key) {
      return key;
    }
    const root = find(parent);
    parents.set(key, root);
    return root;
  };
  const union = (left: string, right: string): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parents.set(rightRoot, leftRoot);
    }
  };
  for (const association of associations) {
    union(`path:${association.path}`, association.symbolKey);
  }
  const symbols = new Map<string, string>();
  for (const association of associations) {
    symbols.set(association.path, find(`path:${association.path}`));
  }
  return {
    declarations: [...declarations.values()].map((declaration) => ({
      ...declaration,
      symbolKey: find(declaration.symbolKey ?? declaration.path.join('.')),
    })),
    symbols,
  };
}

function getTypeContainerPaths(typeName: string, expected: string): string[][] {
  const sourceFile = ts.createSourceFile(
    'property-type.ts',
    `type PropertyType = ${typeName};`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declaration = sourceFile.statements.find(ts.isTypeAliasDeclaration);
  if (!declaration) {
    return [];
  }
  const paths: string[][] = [];
  const visit = (node: ts.TypeNode, path: string[]): void => {
    if (ts.isParenthesizedTypeNode(node)) {
      visit(node.type, path);
      return;
    }
    if (ts.isArrayTypeNode(node)) {
      visit(node.elementType, [...path, '[]']);
      return;
    }
    if (
      ts.isTypeReferenceNode(node) &&
      ts.isIdentifier(node.typeName) &&
      node.typeName.text === 'Array' &&
      node.typeArguments?.length === 1
    ) {
      visit(node.typeArguments[0], [...path, '[]']);
      return;
    }
    if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
      for (const type of node.types) {
        visit(type, path);
      }
      return;
    }
    if (
      ts.isTypeReferenceNode(node) &&
      ts.isIdentifier(node.typeName) &&
      node.typeName.text === expected
    ) {
      paths.push(path);
    }
  };
  visit(declaration.type, []);
  return paths;
}

function resolveEachCollectionPath(
  localName: TemplateExpression['localDefinitions'][number],
  definitions: TemplateExpression['localDefinitions'],
  rootNames: Set<string>,
): string[] | undefined {
  const sourceFile = ts.createSourceFile(
    'each-collection.js',
    `(${localName.collectionText})`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const resolve = (node: ts.Expression): string[] | undefined => {
    const current = unwrapExpression(node);
    if (ts.isIdentifier(current)) {
      if (localName.collectionLocalNames.includes(current.text)) {
        const definition = [...definitions]
          .reverse()
          .find(
            (candidate) =>
              candidate.name === current.text &&
              candidate.sourceOffset !== localName.sourceOffset,
          );
        const parent = definition
          ? resolveEachCollectionPath(definition, definitions, rootNames)
          : undefined;
        return parent ? [...parent, '[]'] : undefined;
      }
      return rootNames.has(current.text) ? [current.text] : undefined;
    }
    if (ts.isPropertyAccessExpression(current)) {
      const parent = resolve(current.expression);
      return parent ? [...parent, current.name.text] : undefined;
    }
    if (ts.isElementAccessExpression(current)) {
      const parent = resolve(current.expression);
      const part = getElementPathPart(
        current.argumentExpression,
        sourceFile,
        0,
      );
      return parent && part ? [...parent, part.text] : undefined;
    }
  };
  const statement = sourceFile.statements[0];
  return statement && ts.isExpressionStatement(statement)
    ? resolve(statement.expression)
    : undefined;
}

function getElementPathPart(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  sourceOffset: number,
): { text: string; start?: number; end?: number } | undefined {
  if (ts.isNumericLiteral(expression)) {
    return { text: '[]' };
  }
  if (
    !ts.isStringLiteral(expression) &&
    !ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return;
  }
  return {
    text: expression.text,
    start: sourceOffset + expression.getStart(sourceFile) + 1,
    end: sourceOffset + expression.getEnd() - 1,
  };
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
  if (ts.isComputedPropertyName(name)) {
    const part = getElementPathPart(name.expression, sourceFile, sourceOffset);
    return part?.start !== undefined && part.end !== undefined
      ? { text: part.text, start: part.start, end: part.end }
      : undefined;
  }
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
