import type * as html from 'vscode-html-languageservice';
import type {
  RiotV3Component,
  ScriptBlock,
  ScriptLanguageId,
  TextRange,
} from './types';

export function getRiotV3Components(
  documentLength: number,
  htmlDocument: html.HTMLDocument,
): RiotV3Component[] {
  const componentRoots = htmlDocument.roots.filter(
    (node) =>
      node.tag !== undefined && node.tag !== 'style' && node.tag !== 'script',
  );
  const roots = componentRoots.length ? componentRoots : htmlDocument.roots;
  return roots.map((root, index) => {
    const nodes = [...forEachHtmlNode([root])];
    const scriptNodes = nodes.filter((node) => node.tag === 'script');
    const styles = nodes.filter((node) => node.tag === 'style');
    return {
      index,
      start: root.start,
      end: root.end || documentLength,
      root,
      nodes,
      styles,
      scriptNodes,
      scripts: getScriptBlocks(root, scriptNodes, styles, documentLength),
    };
  });
}

export function getTemplateIgnoredRanges(
  component: RiotV3Component,
): TextRange[] {
  return [
    ...component.styles
      .filter((node) => node.end > node.start)
      .map((node) => ({
        start: node.start,
        end: node.end,
      })),
    ...component.scriptNodes
      .filter((node) => node.end > node.start)
      .map((node) => ({
        start: node.start,
        end: node.end,
      })),
    ...component.scripts,
  ]
    .filter((range) => range.end > range.start)
    .map((range) => ({
      start: range.start,
      end: range.end,
    }));
}

export function getStyleLanguageId(node: html.Node): 'css' | 'scss' | 'less' {
  const language =
    getAttributeValue(node, 'lang') ?? getAttributeValue(node, 'type');
  switch (language) {
    case 'scss':
    case 'text/scss':
    case 'x-scss':
    case 'text/x-scss':
      return 'scss';
    case 'less':
    case 'text/less':
    case 'x-less':
    case 'text/x-less':
      return 'less';
    default:
      return 'css';
  }
}

function getScriptBlocks(
  root: html.Node,
  scriptNodes: html.Node[],
  styleNodes: html.Node[],
  documentLength: number,
): ScriptBlock[] {
  const blocks: ScriptBlock[] = [];
  for (const script of scriptNodes) {
    if (script.startTagEnd !== undefined && script.endTagStart !== undefined) {
      blocks.push({
        start: script.startTagEnd,
        end: script.endTagStart,
        languageId: getScriptLanguageId(script),
      });
    }
  }

  blocks.push(
    ...getOpenSyntaxBlocks(
      root,
      [...scriptNodes, ...styleNodes],
      documentLength,
    ),
  );
  return blocks;
}

function getOpenSyntaxBlocks(
  root: html.Node,
  excludedNodes: html.Node[],
  documentLength: number,
): ScriptBlock[] {
  if (root.startTagEnd === undefined) {
    return [];
  }
  const rootEnd = root.endTagStart ?? (root.end || documentLength);
  let lastHtmlEnd = root.startTagEnd;
  for (const child of root.children ?? []) {
    if (
      child.tag === 'script' ||
      child.tag === 'style' ||
      !isRiotV3HtmlTagName(child.tag)
    ) {
      continue;
    }
    lastHtmlEnd = Math.max(lastHtmlEnd, child.end);
  }
  if (lastHtmlEnd >= rootEnd) {
    return [];
  }
  const blocks: ScriptBlock[] = [];
  const excludedRanges = excludedNodes
    .filter((node) => node.end > lastHtmlEnd && node.start < rootEnd)
    .sort((a, b) => a.start - b.start);
  let cursor = lastHtmlEnd;
  for (const node of excludedRanges) {
    if (cursor < node.start) {
      blocks.push({
        start: cursor,
        end: Math.min(node.start, rootEnd),
        languageId: 'javascript',
      });
    }
    cursor = Math.max(cursor, node.end);
  }
  if (cursor < rootEnd) {
    blocks.push({
      start: cursor,
      end: rootEnd,
      languageId: 'javascript',
    });
  }
  return blocks;
}

function isRiotV3HtmlTagName(tag: string | undefined): boolean {
  return tag !== undefined && /^-?[A-Za-z]/.test(tag);
}

function* forEachHtmlNode(nodes: html.Node[]): Generator<html.Node> {
  for (const node of nodes) {
    yield node;
    if (node.children) {
      yield* forEachHtmlNode(node.children);
    }
  }
}

function getScriptLanguageId(node: html.Node): ScriptLanguageId {
  const language =
    getAttributeValue(node, 'lang') ?? getAttributeValue(node, 'type');
  switch (language) {
    case 'ts':
    case 'typescript':
    case 'text/typescript':
    case 'application/typescript':
      return 'typescript';
    case 'tsx':
    case 'text/tsx':
      return 'typescriptreact';
    case 'jsx':
    case 'text/jsx':
      return 'javascriptreact';
    default:
      return 'javascript';
  }
}

function getAttributeValue(node: html.Node, name: string): string | undefined {
  const value = node.attributes?.[name];
  if (typeof value !== 'string') {
    return;
  }
  return value
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .toLowerCase();
}
