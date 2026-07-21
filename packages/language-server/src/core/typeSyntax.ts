import { scanBalanced, scanJavaScriptNonCode } from './scanners';

export interface ObjectTypeProperty {
  name: string;
  typeName: string;
}

export interface ObjectTypeShape {
  properties: ObjectTypeProperty[];
  open: boolean;
}

const openObjectType = 'Record<string, any>';

export function parseObjectType(
  typeName: string,
): ObjectTypeProperty[] | undefined {
  const trimmed = typeName.trim();
  if (
    !trimmed.startsWith('{') ||
    scanBalanced(trimmed, 0, '{', '}') !== trimmed.length
  ) {
    return;
  }
  const body = trimmed.slice(1, -1).trim();
  if (!body) {
    return [];
  }
  const properties: ObjectTypeProperty[] = [];
  for (const member of splitTopLevelTypeMembers(body)) {
    const colon = findTopLevelPropertyColon(member);
    if (colon === undefined) {
      return;
    }
    const name = member.slice(0, colon).trim();
    const memberType = member.slice(colon + 1).trim();
    if (!name || !memberType) {
      return;
    }
    properties.push({ name, typeName: memberType });
  }
  return properties;
}

export function formatObjectType(properties: ObjectTypeProperty[]): string {
  return `{ ${properties
    .map((property) => `${property.name}: ${property.typeName};`)
    .join(' ')} }`;
}

export function parseObjectTypeShape(
  typeName: string,
): ObjectTypeShape | undefined {
  const trimmed = typeName.trim();
  if (trimmed === openObjectType) {
    return { properties: [], open: true };
  }
  const properties = parseObjectType(trimmed);
  if (properties) {
    return { properties, open: false };
  }
  const suffix = ` & ${openObjectType}`;
  if (trimmed.endsWith(suffix)) {
    const openProperties = parseObjectType(trimmed.slice(0, -suffix.length));
    if (openProperties) {
      return { properties: openProperties, open: true };
    }
  }
  const prefix = `${openObjectType} & `;
  if (trimmed.startsWith(prefix)) {
    const openProperties = parseObjectType(trimmed.slice(prefix.length));
    if (openProperties) {
      return { properties: openProperties, open: true };
    }
  }
}

export function formatObjectTypeShape(shape: ObjectTypeShape): string {
  if (shape.open && !shape.properties.length) {
    return openObjectType;
  }
  const typeName = formatObjectType(shape.properties);
  return shape.open ? `${typeName} & ${openObjectType}` : typeName;
}

export function parseArrayType(typeName: string): string | undefined {
  const trimmed = typeName.trim();
  if (!trimmed.endsWith('[]')) {
    return;
  }
  const elementType = trimmed.slice(0, -2).trim();
  if (
    elementType.startsWith('(') &&
    scanBalanced(elementType, 0, '(', ')') === elementType.length
  ) {
    return elementType.slice(1, -1).trim();
  }
  return elementType || undefined;
}

export function formatArrayType(elementType: string): string {
  const trimmed = elementType.trim();
  const requiresParentheses =
    splitTopLevelUnionTypes(trimmed).length > 1 ||
    trimmed.includes(' & ') ||
    trimmed.includes('=>');
  return `${requiresParentheses ? `(${trimmed})` : trimmed}[]`;
}

export function formatUnionType(typeNames: string[]): string {
  return typeNames.map(parenthesizeUnionMember).join(' | ');
}

export function splitTopLevelUnionTypes(typeName: string): string[] {
  const members: string[] = [];
  let memberStart = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let angleDepth = 0;
  for (let offset = 0; offset <= typeName.length; offset++) {
    const char = typeName[offset];
    if (char === '(') {
      parenDepth++;
    } else if (char === ')') {
      parenDepth--;
    } else if (char === '[') {
      bracketDepth++;
    } else if (char === ']') {
      bracketDepth--;
    } else if (char === '{') {
      braceDepth++;
    } else if (char === '}') {
      braceDepth--;
    } else if (char === '<') {
      angleDepth++;
    } else if (char === '>') {
      angleDepth--;
    } else if (
      (char === '|' || offset === typeName.length) &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      angleDepth === 0
    ) {
      const member = typeName.slice(memberStart, offset).trim();
      if (member) {
        members.push(member);
      }
      memberStart = offset + 1;
    }
  }
  return members;
}

function parenthesizeUnionMember(typeName: string): string {
  return typeName.includes('=>') ? `(${typeName})` : typeName;
}

function splitTopLevelTypeMembers(text: string): string[] {
  const members: string[] = [];
  let memberStart = 0;
  let braceDepth = 0;
  for (let offset = 0; offset <= text.length; offset++) {
    const char = text[offset];
    if (char === '{') {
      braceDepth++;
    } else if (char === '}') {
      braceDepth--;
    } else if ((char === ';' || offset === text.length) && braceDepth === 0) {
      const member = text.slice(memberStart, offset).trim();
      if (member) {
        members.push(member);
      }
      memberStart = offset + 1;
    }
  }
  return members;
}

function findTopLevelPropertyColon(text: string): number | undefined {
  for (let offset = 0; offset < text.length; ) {
    const char = text[offset];
    const skipped = scanJavaScriptNonCode(text, offset);
    if (skipped !== undefined) {
      offset = skipped;
      continue;
    }
    if (char === '(') {
      offset = scanBalanced(text, offset, '(', ')') ?? text.length;
      continue;
    }
    if (char === '[') {
      offset = scanBalanced(text, offset, '[', ']') ?? text.length;
      continue;
    }
    if (char === '{') {
      offset = scanBalanced(text, offset, '{', '}') ?? text.length;
      continue;
    }
    if (char === ':') {
      return offset;
    }
    offset++;
  }
}
